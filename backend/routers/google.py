from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import set_setting
from backend.services import google_calendar as gcal
from backend.services import google_sync

router = APIRouter(prefix="/api/google", tags=["google"])


class CredentialsPayload(BaseModel):
    client_id: str
    client_secret: str


class CalendarPayload(BaseModel):
    calendar_id: str


class VisiblePayload(BaseModel):
    calendar_ids: list[str] | None = None


class EventPayload(BaseModel):
    title: str = Field(min_length=1)
    start: datetime
    end: datetime | None = None
    all_day: bool = False
    description: str | None = None
    calendar_id: str | None = None  # calendario donde vive el evento


@router.get("/status")
def status(db: Session = Depends(get_db)):
    client_id, secret = gcal.credentials(db)
    conectado = gcal.is_connected(db)
    info = {
        "has_credentials": bool(client_id and secret),
        "connected": conectado,
        "client_id": client_id,
        "redirect_uri": gcal.REDIRECT_URI,
        "calendar_id": gcal.calendar_id(db),
        "calendars": [],
        "visible_calendars": gcal.visible_calendars(db),
        "error": None,
    }
    if conectado:
        try:
            info["calendars"] = gcal.calendars(db)
        except gcal.GoogleError as e:
            info["error"] = str(e)
    return info


@router.put("/visible-calendars")
def set_visible(payload: VisiblePayload, db: Session = Depends(get_db)):
    gcal.set_visible_calendars(db, payload.calendar_ids)
    return {"visible_calendars": gcal.visible_calendars(db)}


@router.put("/credentials")
def save_credentials(payload: CredentialsPayload, db: Session = Depends(get_db)):
    set_setting(db, gcal.CLIENT_ID_KEY, payload.client_id.strip() or None)
    set_setting(db, gcal.CLIENT_SECRET_KEY, payload.client_secret.strip() or None)
    return {"saved": True}


@router.get("/auth-url")
def get_auth_url(db: Session = Depends(get_db)):
    try:
        return {"url": gcal.auth_url(db)}
    except gcal.GoogleError as e:
        raise HTTPException(400, str(e))


@router.get("/callback")
def callback(code: str | None = None, error: str | None = None, db: Session = Depends(get_db)):
    """Aqui aterriza Google despues de que autorizas; regresa al panel."""
    if error:
        return RedirectResponse(f"/ajustes?google=error&detalle={error}")
    if not code:
        return RedirectResponse("/ajustes?google=error")
    try:
        gcal.exchange_code(db, code)
    except gcal.GoogleError as e:
        return RedirectResponse(f"/ajustes?google=error&detalle={e}")
    return RedirectResponse("/ajustes?google=ok")


@router.put("/calendar")
def choose_calendar(payload: CalendarPayload, db: Session = Depends(get_db)):
    set_setting(db, gcal.CALENDAR_KEY, payload.calendar_id)
    return {"calendar_id": payload.calendar_id}


@router.post("/sync")
def sync_now(db: Session = Depends(get_db)):
    """Sube a Google todo lo que falte, ahora mismo. Tambien corre solo cada minuto."""
    if not gcal.is_connected(db):
        raise HTTPException(400, "Primero conecta tu cuenta de Google")
    return google_sync.sync_seguro(db)


@router.post("/disconnect")
def disconnect(db: Session = Depends(get_db)):
    gcal.disconnect(db)
    return {"connected": False}


@router.post("/events", status_code=201)
def create_event(payload: EventPayload, db: Session = Depends(get_db)):
    try:
        e = gcal.create_event(db, payload.title, payload.start, payload.end,
                              payload.all_day, payload.description)
        return {"id": e.get("id")}
    except gcal.GoogleError as e:
        raise HTTPException(502, str(e))


@router.put("/events/{event_id}")
def update_event(event_id: str, payload: EventPayload, db: Session = Depends(get_db)):
    try:
        gcal.update_event(db, event_id, payload.title, payload.start, payload.end,
                          payload.all_day, payload.description, payload.calendar_id)
        return {"updated": True}
    except gcal.GoogleError as e:
        raise HTTPException(502, str(e))


@router.delete("/events/{event_id}")
def delete_event(event_id: str, calendar_id: str | None = None, db: Session = Depends(get_db)):
    try:
        gcal.delete_event(db, event_id, calendar_id)
        return {"deleted": True}
    except gcal.GoogleError as e:
        raise HTTPException(502, str(e))
