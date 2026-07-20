from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Note

router = APIRouter(prefix="/api/notes", tags=["notes"])


class NotePayload(BaseModel):
    title: str = Field(min_length=1)
    content: str | None = None
    audio_path: str | None = None
    context_id: int | None = None
    pinned: bool = False


@router.get("")
def list_notes(q: str | None = None, context_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Note)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Note.title.ilike(like), Note.content.ilike(like)))
    if context_id:
        query = query.filter(Note.context_id == context_id)
    notes = query.order_by(Note.pinned.desc(), Note.updated_at.desc()).all()
    return [n.to_dict() for n in notes]


@router.post("", status_code=201)
def create_note(payload: NotePayload, db: Session = Depends(get_db)):
    note = Note(
        title=payload.title.strip(),
        content=payload.content,
        audio_path=payload.audio_path,
        context_id=payload.context_id,
        pinned=1 if payload.pinned else 0,
    )
    db.add(note)
    db.commit()
    return note.to_dict()


@router.put("/{note_id}")
def update_note(note_id: int, payload: NotePayload, db: Session = Depends(get_db)):
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(404, "Nota no encontrada")
    note.title = payload.title.strip()
    note.content = payload.content
    note.audio_path = payload.audio_path
    note.context_id = payload.context_id
    note.pinned = 1 if payload.pinned else 0
    db.commit()
    return note.to_dict()


@router.delete("/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = db.get(Note, note_id)
    if not note:
        raise HTTPException(404, "Nota no encontrada")
    db.delete(note)
    db.commit()
    return {"deleted": True}
