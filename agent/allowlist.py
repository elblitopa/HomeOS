"""La allowlist LOCAL: la única fuente de verdad de qué puede ejecutar esta PC.

Modelo de autorización (la regla más importante del agente):
- El cloud puede PROPONER configuración (o `python -m agent propose` la genera
  desde la instalación local de HomeOS), pero nada queda ejecutable hasta que
  el dueño de la PC corre `python -m agent approve <app_id>` aquí, localmente.
- Cada app guarda por separado lo APROBADO (lo único que el executor usa) y lo
  PROPUESTO (visible con `pending`/`show`, inerte hasta aprobarse). Una
  propuesta nueva sobre una app ya aprobada NO toca lo aprobado: queda
  esperando su propio approve.
- El archivo vive en agent/data/allowlist.json (persistente entre reinicios,
  fuera de git, sin secretos).
"""

import json
import os
import re
import sqlite3
from datetime import datetime
from pathlib import Path

from agent.config import DATA_DIR

ALLOWLIST_FILE = DATA_DIR / "allowlist.json"

APP_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")

CAMPOS_APP = ("name", "folder", "launcher", "port")


class AllowlistError(Exception):
    pass


def _ahora() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _normalizar(entry: dict) -> dict:
    """Se queda SOLO con los campos conocidos, tipados y saneados."""
    try:
        name = str(entry["name"]).strip()
        folder = str(entry["folder"]).strip()
        launcher = str(entry["launcher"]).strip()
        port = int(entry["port"])
    except (KeyError, TypeError, ValueError):
        raise AllowlistError("Entrada de app incompleta: requiere name, folder, launcher y port")
    if not (1 <= port <= 65535):
        raise AllowlistError(f"Puerto inválido: {port}")
    if not folder or not launcher or "\x00" in folder or "\x00" in launcher:
        raise AllowlistError("folder/launcher inválidos")
    # el launcher es un NOMBRE de archivo dentro de folder, jamás una ruta
    if os.path.basename(launcher) != launcher:
        raise AllowlistError("launcher debe ser un nombre de archivo, sin rutas")
    return {"name": name, "folder": folder, "launcher": launcher, "port": port}


def validar_app_id(app_id: str) -> str:
    if not isinstance(app_id, str) or not APP_ID_RE.fullmatch(app_id):
        raise AllowlistError(f"app_id inválido: {app_id!r}")
    return app_id


def load() -> dict:
    if not ALLOWLIST_FILE.is_file():
        return {"apps": {}}
    try:
        data = json.loads(ALLOWLIST_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        # allowlist corrupta = NADA autorizado; mejor cerrado que adivinar
        return {"apps": {}}
    if not isinstance(data, dict) or not isinstance(data.get("apps"), dict):
        return {"apps": {}}
    return data


def save(data: dict) -> None:
    """Escritura atómica: tmp + os.replace, para que un corte a media escritura
    no deje una allowlist ilegible (= todo desautorizado)."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = ALLOWLIST_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, ALLOWLIST_FILE)


def approved_apps() -> dict[str, dict]:
    """Lo ÚNICO que el executor consulta: {app_id: config aprobada}."""
    return {
        app_id: entry["approved"]
        for app_id, entry in load()["apps"].items()
        if entry.get("approved")
    }


def propose(app_id: str, datos: dict, source: str) -> str:
    """Registra una PROPUESTA. Nunca autoriza nada por sí misma.

    Devuelve: "nueva" | "actualizada" | "ya-aprobada" | "sin-cambio".
    """
    app_id = validar_app_id(app_id)
    datos = _normalizar(datos)
    data = load()
    entry = data["apps"].setdefault(
        app_id, {"approved": None, "proposed": None, "source": source}
    )
    if entry.get("approved") == datos:
        # ya está aprobada exactamente así; limpiar una propuesta obsoleta
        if entry.get("proposed"):
            entry["proposed"] = None
            save(data)
        return "ya-aprobada"
    if entry.get("proposed") == datos:
        return "sin-cambio"
    resultado = "actualizada" if entry.get("proposed") else "nueva"
    entry["proposed"] = datos
    entry["proposed_at"] = _ahora()
    entry["source"] = source
    save(data)
    return resultado


def approve(app_id: str) -> dict:
    """Convierte la propuesta pendiente en la config APROBADA de la app."""
    app_id = validar_app_id(app_id)
    data = load()
    entry = data["apps"].get(app_id)
    if not entry:
        raise AllowlistError(f"No existe ninguna app '{app_id}' en la allowlist")
    if not entry.get("proposed"):
        if entry.get("approved"):
            raise AllowlistError(f"'{app_id}' ya está aprobada y no tiene propuesta pendiente")
        raise AllowlistError(f"'{app_id}' no tiene propuesta pendiente que aprobar")
    entry["approved"] = entry.pop("proposed")
    entry["proposed"] = None
    entry["approved_at"] = _ahora()
    save(data)
    return entry["approved"]


def revoke(app_id: str) -> None:
    """Desautoriza la app (la entrada queda, por si se quiere re-aprobar)."""
    app_id = validar_app_id(app_id)
    data = load()
    entry = data["apps"].get(app_id)
    if not entry or not entry.get("approved"):
        raise AllowlistError(f"'{app_id}' no está aprobada")
    entry["approved"] = None
    entry["approved_at"] = None
    save(data)


def estado_de(entry: dict) -> str:
    if entry.get("approved") and entry.get("proposed"):
        return "aprobada + propuesta pendiente"
    if entry.get("approved"):
        return "aprobada"
    if entry.get("proposed"):
        return "pendiente"
    return "revocada"


def propose_from_homeos_db(db_path: Path) -> list[tuple[str, str]]:
    """Migración inicial: lee las apps de la instalación LOCAL de HomeOS y las
    registra como PROPUESTAS (nunca como aprobadas).

    La DB se abre en modo solo-lectura; si no existe, error claro. Esto lo
    corre el dueño de la PC a mano (python -m agent propose): el contenido
    sale de su propio disco, y aun así cada app exige su approve explícito.
    """
    if not Path(db_path).is_file():
        raise AllowlistError(f"No se encontró la base local de HomeOS en: {db_path}")
    uri = f"file:{db_path}?mode=ro"
    try:
        con = sqlite3.connect(uri, uri=True)
        filas = con.execute(
            "SELECT slug, name, folder, launcher, port FROM apps ORDER BY slug"
        ).fetchall()
        con.close()
    except sqlite3.Error as e:
        raise AllowlistError(f"No se pudo leer la base local de HomeOS: {e}")

    resultados: list[tuple[str, str]] = []
    for slug, name, folder, launcher, port in filas:
        try:
            resultado = propose(
                slug,
                {"name": name, "folder": folder, "launcher": launcher, "port": port},
                source="homeos-db",
            )
        except AllowlistError as e:
            resultado = f"descartada ({e})"
        resultados.append((slug, resultado))
    return resultados
