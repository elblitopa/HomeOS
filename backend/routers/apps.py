import json
import os
import re
import unicodedata
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.config import APPS_MANIFEST_DIR, IS_CLOUD
from backend.database import get_db
from backend.models import Agent, AppEntry, get_setting, set_setting
from backend.services import agent_queue, ports, process_manager

router = APIRouter(prefix="/api/apps", tags=["apps"])

# el device al que pertenecen las apps mientras solo exista una PC
DEFAULT_DEVICE_ID = "pc-principal"


def _encolar_o_http(db: Session, device_id: str, type_: str, **kwargs):
    """Traduce los errores semánticos de la cola a HTTP."""
    try:
        return agent_queue.encolar(db, device_id, type_, **kwargs)
    except agent_queue.QueueError as e:
        raise HTTPException(e.status, e.detail)
    except ValueError as e:
        # payload invalido (path con null byte, demasiado largo, campo extra)
        raise HTTPException(422, str(e))


def _estado_cloud(db: Session, apps: list[AppEntry]) -> dict[int, dict]:
    """Estado de las apps según el ÚLTIMO heartbeat del agente de cada una.

    En cloud jamás se toca 127.0.0.1 (sería el loopback de la VM, no la PC).
    Con el agente offline, todas sus apps aparecen apagadas/no disponibles.
    """
    agentes = {a.device_id: a for a in db.query(Agent).all()}
    estado: dict[int, dict] = {}
    for a in apps:
        agent = agentes.get(a.device_id or DEFAULT_DEVICE_ID)
        online = agent_queue.agente_online(agent)
        reporte = (agent.apps_status or {}).get(a.slug, {}) if (agent and online) else {}
        estado[a.id] = {
            "running": bool(reporte.get("running") or reporte.get("port_open")),
            "port": a.port,
            "managed": bool(reporte.get("pid")),
            "agent_online": online,
        }
    return estado


def slugify(name: str) -> str:
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text or "app"


class AppCreate(BaseModel):
    name: str = Field(min_length=1)
    folder: str
    launcher: str
    port: int = Field(ge=1, le=65535)
    icon_path: str | None = None
    banner_path: str | None = None
    accent: str = "#2383e2"
    sort_order: int = 0


class AppUpdate(BaseModel):
    name: str | None = None
    folder: str | None = None
    launcher: str | None = None
    port: int | None = Field(default=None, ge=1, le=65535)
    icon_path: str | None = None
    banner_path: str | None = None
    accent: str | None = None
    sort_order: int | None = None


class BrowseRequest(BaseModel):
    path: str = ""


def _validate_paths(folder: str, launcher: str) -> None:
    # en cloud las rutas son de la PC, no de esta VM: aqui no hay nada que
    # validar (la validacion real la hace el agente en su maquina, Fase 3)
    if IS_CLOUD:
        return
    if not os.path.isdir(folder):
        raise HTTPException(400, f"La carpeta no existe: {folder}")
    if not os.path.isfile(os.path.join(folder, launcher)):
        raise HTTPException(400, f"No se encontro el .bat: {launcher}")


def _unique_slug(db: Session, base: str, exclude_id: int | None = None) -> str:
    slug, n = base, 2
    while True:
        q = db.query(AppEntry).filter(AppEntry.slug == slug)
        if exclude_id is not None:
            q = q.filter(AppEntry.id != exclude_id)
        if not q.first():
            return slug
        slug = f"{base}-{n}"
        n += 1


@router.get("")
async def list_apps(db: Session = Depends(get_db)):
    apps = db.query(AppEntry).order_by(AppEntry.sort_order, AppEntry.name).all()
    if IS_CLOUD:
        estado = _estado_cloud(db, apps)
        return [
            {**a.to_dict(), "running": estado[a.id]["running"],
             "agent_online": estado[a.id]["agent_online"]}
            for a in apps
        ]
    status = await ports.check_ports([a.port for a in apps])
    return [{**a.to_dict(), "running": status.get(a.port, False)} for a in apps]


@router.get("/status")
async def apps_status(db: Session = Depends(get_db)):
    apps = db.query(AppEntry).all()
    if IS_CLOUD:
        return _estado_cloud(db, apps)
    status = await ports.check_ports([a.port for a in apps])
    return {
        a.id: {
            "running": status.get(a.port, False),
            "port": a.port,
            "managed": bool(a.last_pid and process_manager.pid_alive(a.last_pid)),
        }
        for a in apps
    }


@router.post("", status_code=201)
def create_app(payload: AppCreate, db: Session = Depends(get_db)):
    _validate_paths(payload.folder, payload.launcher)
    entry = AppEntry(
        **payload.model_dump(),
        slug=_unique_slug(db, slugify(payload.name)),
    )
    db.add(entry)
    db.commit()
    return entry.to_dict()


@router.put("/{app_id}")
def update_app(app_id: int, payload: AppUpdate, db: Session = Depends(get_db)):
    entry = db.get(AppEntry, app_id)
    if not entry:
        raise HTTPException(404, "App no encontrada")
    data = payload.model_dump(exclude_unset=True)
    folder = data.get("folder", entry.folder)
    launcher = data.get("launcher", entry.launcher)
    _validate_paths(folder, launcher)
    for key, value in data.items():
        setattr(entry, key, value)
    if "name" in data:
        entry.slug = _unique_slug(db, slugify(entry.name), exclude_id=entry.id)
    db.commit()
    return entry.to_dict()


@router.delete("/{app_id}")
def delete_app(app_id: int, db: Session = Depends(get_db)):
    entry = db.get(AppEntry, app_id)
    if not entry:
        raise HTTPException(404, "App no encontrada")
    db.delete(entry)
    db.commit()
    return {"deleted": True}


@router.post("/{app_id}/start")
def start_app(app_id: int, db: Session = Depends(get_db)):
    entry = db.get(AppEntry, app_id)
    if not entry:
        raise HTTPException(404, "App no encontrada")

    if IS_CLOUD:
        # el comando lleva SOLO el app_id (= slug): las rutas nunca viajan;
        # el agente las resuelve contra su allowlist local (Fase 3)
        cmd = _encolar_o_http(
            db, entry.device_id or DEFAULT_DEVICE_ID, "START_APP", app_id=entry.slug
        )
        return JSONResponse({"queued": True, "command_id": cmd.id}, status_code=202)

    if ports.check_port(entry.port):
        raise HTTPException(409, f"Ya hay algo corriendo en el puerto {entry.port}")
    try:
        pid = process_manager.start_app(entry.folder, entry.launcher)
    except FileNotFoundError as e:
        raise HTTPException(400, str(e))
    entry.last_pid = pid
    entry.last_started_at = datetime.utcnow()
    db.commit()
    return {"pid": pid}


@router.post("/{app_id}/stop")
def stop_app(app_id: int, db: Session = Depends(get_db)):
    entry = db.get(AppEntry, app_id)
    if not entry:
        raise HTTPException(404, "App no encontrada")

    if IS_CLOUD:
        cmd = _encolar_o_http(
            db, entry.device_id or DEFAULT_DEVICE_ID, "STOP_APP", app_id=entry.slug
        )
        return JSONResponse({"queued": True, "command_id": cmd.id}, status_code=202)

    result = process_manager.stop_app(entry.last_pid, entry.port)
    entry.last_pid = None
    db.commit()
    return result


@router.post("/browse")
def browse(payload: BrowseRequest, db: Session = Depends(get_db)):
    """Explorador de carpetas para el formulario de apps.

    En cloud JAMÁS se toca el filesystem de la VM: la solicitud se convierte
    en un comando BROWSE_FOLDERS al agente, que la resolverá contra sus
    allowed_browse_roots (Fase 3). El path viaja como dato para navegar,
    nunca se ejecuta ni se interpreta aquí.
    """
    if IS_CLOUD:
        path = payload.path.strip()
        cmd = _encolar_o_http(
            db, DEFAULT_DEVICE_ID, "BROWSE_FOLDERS",
            payload={"path": path} if path else {},
        )
        return JSONResponse({"queued": True, "command_id": cmd.id}, status_code=202)

    path = payload.path.strip() or os.path.expanduser("~")
    if not os.path.isdir(path):
        raise HTTPException(400, f"La ruta no existe: {path}")
    dirs, bats = [], []
    try:
        for item in sorted(os.listdir(path), key=str.lower):
            full = os.path.join(path, item)
            if os.path.isdir(full) and not item.startswith((".", "$")):
                dirs.append(item)
            elif item.lower().endswith(".bat"):
                bats.append(item)
    except PermissionError:
        raise HTTPException(403, "Sin permiso para leer esa carpeta")
    parent = os.path.dirname(path.rstrip("\\/"))
    return {
        "path": path,
        "parent": parent if parent != path else None,
        "dirs": dirs,
        "bats": bats,
    }


@router.post("/import")
def import_manifests(db: Session = Depends(get_db)):
    return {"imported": run_manifest_import(db)}


IMPORTED_KEY = "imported_manifests"


def _app_key(folder: str, launcher: str) -> tuple[str, str]:
    """Identidad real de una app: a donde apunta, no como se llama.
    El nombre se puede editar y el slug cambia con el, asi que no sirven."""
    return (os.path.normcase(os.path.normpath(folder)), launcher.strip().lower())


def run_manifest_import(db: Session) -> list[str]:
    """Escanea HomeOS/Apps/*.json y registra las apps que falten.

    Cada archivo se importa UNA sola vez: si despues borras la app desde la
    interfaz, no vuelve a aparecer sola en el siguiente arranque.
    """
    try:
        already = set(json.loads(get_setting(db, IMPORTED_KEY) or "[]"))
    except json.JSONDecodeError:
        already = set()

    registradas = {_app_key(a.folder, a.launcher) for a in db.query(AppEntry).all()}
    imported: list[str] = []
    seen = set(already)

    for file in sorted(APPS_MANIFEST_DIR.glob("*.json")):
        if file.name in already:
            continue
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
            name = data["name"]
            folder = data["folder"]
            launcher = data["launcher"]
            port = int(data["port"])
        except (json.JSONDecodeError, KeyError, ValueError, OSError):
            continue
        # en cloud las rutas del manifiesto son de la PC (C:\...), no de esta
        # VM Linux: validar aqui descartaria TODAS las apps. Solo en local.
        if not IS_CLOUD and (
            not os.path.isdir(folder) or not os.path.isfile(os.path.join(folder, launcher))
        ):
            continue

        # el manifiesto queda marcado aunque la app ya existiera, para no
        # volver a evaluarlo en cada arranque
        seen.add(file.name)
        key = _app_key(folder, launcher)
        if key in registradas:
            continue

        db.add(
            AppEntry(
                name=name,
                slug=_unique_slug(db, slugify(name)),
                folder=folder,
                launcher=launcher,
                port=port,
            )
        )
        registradas.add(key)
        imported.append(name)

    if imported:
        db.commit()
    if seen != already:
        set_setting(db, IMPORTED_KEY, json.dumps(sorted(seen)))
    return imported
