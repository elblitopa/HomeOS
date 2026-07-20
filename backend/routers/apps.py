import json
import os
import re
import unicodedata
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.config import APPS_MANIFEST_DIR
from backend.database import get_db
from backend.models import AppEntry
from backend.services import ports, process_manager

router = APIRouter(prefix="/api/apps", tags=["apps"])


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
    status = await ports.check_ports([a.port for a in apps])
    return [{**a.to_dict(), "running": status.get(a.port, False)} for a in apps]


@router.get("/status")
async def apps_status(db: Session = Depends(get_db)):
    apps = db.query(AppEntry).all()
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
    result = process_manager.stop_app(entry.last_pid, entry.port)
    entry.last_pid = None
    db.commit()
    return result


@router.post("/browse")
def browse(payload: BrowseRequest):
    """Explorador server-side: lista subcarpetas y .bat de una ruta."""
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


def run_manifest_import(db: Session) -> list[str]:
    """Escanea HomeOS/Apps/*.json y registra apps nuevas (por slug)."""
    imported: list[str] = []
    for file in sorted(APPS_MANIFEST_DIR.glob("*.json")):
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
            name = data["name"]
            folder = data["folder"]
            launcher = data["launcher"]
            port = int(data["port"])
        except (json.JSONDecodeError, KeyError, ValueError, OSError):
            continue
        slug = slugify(name)
        if db.query(AppEntry).filter(AppEntry.slug == slug).first():
            continue
        if not os.path.isdir(folder) or not os.path.isfile(os.path.join(folder, launcher)):
            continue
        db.add(AppEntry(name=name, slug=slug, folder=folder, launcher=launcher, port=port))
        imported.append(name)
    if imported:
        db.commit()
    return imported
