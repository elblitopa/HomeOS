from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import get_setting, set_setting
from backend.notifications.discord import send_webhook

router = APIRouter(prefix="/api/settings", tags=["settings"])

DISCORD_KEY = "discord_webhook_url"
WEEK_START_KEY = "week_starts_on"
WEEK_STARTS = ("monday", "sunday")


class SettingsPayload(BaseModel):
    discord_webhook_url: str | None = None
    week_starts_on: str | None = None


@router.get("")
def read_settings(db: Session = Depends(get_db)):
    return {
        "discord_webhook_url": get_setting(db, DISCORD_KEY),
        "week_starts_on": get_setting(db, WEEK_START_KEY) or "monday",
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
