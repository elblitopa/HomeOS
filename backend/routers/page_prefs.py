"""Personalización por página: banner y tipografía (estilo Notion).

Las preferencias se sincronizan entre dispositivos porque viven en la base
(tabla kv `settings`, una entrada JSON por página), no en localStorage. El
registro de páginas personalizables se espeja con el del frontend
(lib/pages.js): los page_key son identificadores estables, nunca títulos ni
rutas completas.

El banner de Inicio ya existía como `home_banner_path`: esa clave sigue
siendo su única fuente de verdad (Ajustes → Portada de Inicio la escribe),
así que migrar aquí no cambia nada de lo que el usuario ya ve.
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import get_setting, set_setting

router = APIRouter(prefix="/api/page-prefs", tags=["page-prefs"])

# espejo de PAGES en frontend/src/lib/pages.js — Ajustes queda fuera a proposito
PAGE_KEYS = (
    "home", "finance", "calendar", "tasks", "businesses",
    "routines", "notes", "files", "apps",
)
FONTS = ("default", "serif", "mono")
# posiciones del cover (object-position); V1 solo usa center, pero la API ya
# acepta las demas para no rehacer nada cuando llegue "Reposicionar"
POSITIONS = ("center", "top", "bottom")

LEGACY_HOME_BANNER = "home_banner_path"


def _clave(page_key: str) -> str:
    return f"page_prefs:{page_key}"


def _defaults() -> dict:
    return {"banner_path": None, "font": "default", "banner_position": "center"}


def leer(db: Session, page_key: str) -> dict:
    prefs = _defaults()
    raw = get_setting(db, _clave(page_key))
    if raw:
        try:
            guardado = json.loads(raw)
            if isinstance(guardado, dict):
                prefs.update({k: v for k, v in guardado.items() if k in prefs})
        except json.JSONDecodeError:
            pass  # un valor corrupto no debe tumbar la pagina: defaults
    if page_key == "home":
        # fuente unica del banner de Inicio: la clave que ya existia
        prefs["banner_path"] = get_setting(db, LEGACY_HOME_BANNER)
    if prefs["font"] not in FONTS:
        prefs["font"] = "default"
    if prefs["banner_position"] not in POSITIONS:
        prefs["banner_position"] = "center"
    return prefs


def _validar_path(path: str | None) -> str | None:
    path = (path or "").strip() or None
    if path and (not path.startswith("/uploads/") or ".." in path):
        raise HTTPException(400, "El banner debe ser un archivo subido a HomeOS")
    return path


class PagePrefsPayload(BaseModel):
    # parcial: solo se tocan los campos que vengan (banner_path: null = quitar)
    banner_path: str | None = None
    font: str | None = None
    banner_position: str | None = None


@router.get("")
def list_page_prefs(db: Session = Depends(get_db)):
    """Todas las paginas de un jalon: el frontend lo pide UNA vez al cargar."""
    return {key: leer(db, key) for key in PAGE_KEYS}


@router.put("/{page_key}")
def update_page_prefs(page_key: str, payload: PagePrefsPayload, db: Session = Depends(get_db)):
    if page_key not in PAGE_KEYS:
        raise HTTPException(404, f"La página {page_key} no es personalizable")
    data = payload.model_dump(exclude_unset=True)
    actual = leer(db, page_key)

    if "font" in data:
        if data["font"] not in FONTS:
            raise HTTPException(400, "Tipografía inválida: default, serif o mono")
        actual["font"] = data["font"]
    if "banner_position" in data:
        if data["banner_position"] not in POSITIONS:
            raise HTTPException(400, "Posición inválida: center, top o bottom")
        actual["banner_position"] = data["banner_position"]
    if "banner_path" in data:
        # quitar el banner solo suelta la asociacion: el archivo se queda en
        # uploads por si otra cosa (una cuenta, un negocio) lo usa
        actual["banner_path"] = _validar_path(data["banner_path"])

    if page_key == "home":
        set_setting(db, LEGACY_HOME_BANNER, actual["banner_path"])
        guardar = {k: v for k, v in actual.items() if k != "banner_path"}
    else:
        guardar = actual
    set_setting(db, _clave(page_key), json.dumps(guardar))
    return leer(db, page_key)
