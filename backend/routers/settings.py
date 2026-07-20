from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import get_setting, set_setting
from backend.notifications.discord import send_webhook

router = APIRouter(prefix="/api/settings", tags=["settings"])

DISCORD_KEY = "discord_webhook_url"


class SettingsPayload(BaseModel):
    discord_webhook_url: str | None = None


@router.get("")
def read_settings(db: Session = Depends(get_db)):
    return {"discord_webhook_url": get_setting(db, DISCORD_KEY)}


@router.put("")
def write_settings(payload: SettingsPayload, db: Session = Depends(get_db)):
    url = (payload.discord_webhook_url or "").strip() or None
    if url and not url.startswith("https://"):
        raise HTTPException(400, "La URL del webhook debe empezar con https://")
    set_setting(db, DISCORD_KEY, url)
    return {"discord_webhook_url": url}


@router.post("/test-webhook")
def test_webhook(db: Session = Depends(get_db)):
    url = get_setting(db, DISCORD_KEY)
    if not url:
        raise HTTPException(400, "Primero guarda la URL del webhook")
    ok = send_webhook("✅ **HomeOS** conectado — así llegarán tus notificaciones.", url)
    if not ok:
        raise HTTPException(502, "Discord no aceptó el mensaje. Revisa la URL.")
    return {"sent": True}
