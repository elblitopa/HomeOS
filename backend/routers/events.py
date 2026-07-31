from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Event
from backend.services.google_sync import sync_aparte

router = APIRouter(prefix="/api/events", tags=["events"])


class EventPayload(BaseModel):
    title: str = Field(min_length=1)
    description: str | None = None
    context_id: int | None = None
    start: datetime
    end: datetime | None = None
    all_day: bool = False
    reminders: list[int] = []
    sync_google: bool = True


@router.get("")
def list_events(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    context_id: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Event)
    if from_:
        q = q.filter(Event.start >= from_)
    if to:
        q = q.filter(Event.start < to)
    if context_id:
        q = q.filter(Event.context_id == context_id)
    return [e.to_dict() for e in q.order_by(Event.start).all()]


@router.get("/{event_id}")
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Evento no encontrado")
    return event.to_dict()


@router.post("", status_code=201)
def create_event(payload: EventPayload, tareas: BackgroundTasks, db: Session = Depends(get_db)):
    event = Event(**payload.model_dump())
    db.add(event)
    db.commit()
    tareas.add_task(sync_aparte)
    return event.to_dict()


@router.put("/{event_id}")
def update_event(event_id: int, payload: EventPayload, tareas: BackgroundTasks,
                 db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Evento no encontrado")
    for key, value in payload.model_dump().items():
        setattr(event, key, value)
    db.commit()
    tareas.add_task(sync_aparte)
    return event.to_dict()


@router.delete("/{event_id}")
def delete_event(event_id: int, tareas: BackgroundTasks, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Evento no encontrado")
    db.delete(event)
    db.commit()
    tareas.add_task(sync_aparte)
    return {"deleted": True}
