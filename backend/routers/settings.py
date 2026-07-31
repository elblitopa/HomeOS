import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import get_setting, set_setting
from backend.notifications.discord import send_webhook

router = APIRouter(prefix="/api/settings", tags=["settings"])

DISCORD_KEY = "discord_webhook_url"
WEEK_START_KEY = "week_starts_on"
COLORS_KEY = "calendar_colors"
WEEK_STARTS = ("monday", "sunday")

KINDS_KEY = "calendar_kinds"

# lo que se ve por defecto: todo menos las transacciones, que son muchas
DEFAULT_KINDS = [
    "evento", "google", "tarea", "suscripcion", "pago", "meta", "nota", "programado",
]

DEFAULT_COLORS = {
    "evento": "#2383e2",
    "google": "#ea4335",
    "tarea": "#0ca678",
    "suscripcion": "#9c36b5",
    "pago": "#e8590c",
    "meta": "#f59e0b",
    "nota": "#6b6b70",
    "programado": "#0b7285",
    "transaccion": "#3b5bdb",
}


class SettingsPayload(BaseModel):
    discord_webhook_url: str | None = None
    week_starts_on: str | None = None
    calendar_colors: dict[str, str] | None = None
    calendar_kinds: list[str] | None = None


def _colors(db: Session) -> dict:
    try:
        guardados = json.loads(get_setting(db, COLORS_KEY) or "{}")
    except json.JSONDecodeError:
        guardados = {}
    return {**DEFAULT_COLORS, **{k: v for k, v in guardados.items() if k in DEFAULT_COLORS}}


def _kinds(db: Session) -> list[str]:
    raw = get_setting(db, KINDS_KEY)
    if raw is None:
        return DEFAULT_KINDS
    try:
        guardados = json.loads(raw)
    except json.JSONDecodeError:
        return DEFAULT_KINDS
    return [k for k in guardados if k in DEFAULT_COLORS]


@router.get("")
def read_settings(db: Session = Depends(get_db)):
    return {
        "discord_webhook_url": get_setting(db, DISCORD_KEY),
        "week_starts_on": get_setting(db, WEEK_START_KEY) or "monday",
        "calendar_colors": _colors(db),
        "calendar_kinds": _kinds(db),
    }


@router.put("")
def write_settings(payload: SettingsPayload, db: Session = Depends(get_db)):
    # solo se tocan las claves que vengan en la peticion, para que guardar
    # una preferencia no borre las demas
    data = payload.model_dump(exclude_unset=True)

    if "discord_webhook_url" in data:
        url = (data["discord_webhook_url"] or "").strip() or None
        if url and not url.startswith("https://"):
            raise HTTPException(400, "La URL del webhook debe empezar con https://")
        set_setting(db, DISCORD_KEY, url)

    if "week_starts_on" in data:
        value = data["week_starts_on"]
        if value not in WEEK_STARTS:
            raise HTTPException(400, "La semana solo puede empezar en lunes o domingo")
        set_setting(db, WEEK_START_KEY, value)

    if "calendar_colors" in data:
        nuevos = data["calendar_colors"] or {}
        for key, value in nuevos.items():
            if key not in DEFAULT_COLORS:
                raise HTTPException(400, f"Tipo de bloque desconocido: {key}")
            if not re.fullmatch(r"#[0-9a-fA-F]{6}", value or ""):
                raise HTTPException(400, f"Color inválido para {key}: {value}")
        set_setting(db, COLORS_KEY, json.dumps({**_colors(db), **nuevos}))

    if "calendar_kinds" in data:
        elegidos = data["calendar_kinds"] or []
        for k in elegidos:
            if k not in DEFAULT_COLORS:
                raise HTTPException(400, f"Tipo de bloque desconocido: {k}")
        set_setting(db, KINDS_KEY, json.dumps(elegidos))

    return read_settings(db)


@router.post("/test-webhook")
def test_webhook(db: Session = Depends(get_db)):
    url = get_setting(db, DISCORD_KEY)
    if not url:
        raise HTTPException(400, "Primero guarda la URL del webhook")
    ok = send_webhook("✅ **HomeOS** conectado — así llegarán tus notificaciones.", url)
    if not ok:
        raise HTTPException(502, "Discord no aceptó el mensaje. Revisa la URL.")
    return {"sent": True}
