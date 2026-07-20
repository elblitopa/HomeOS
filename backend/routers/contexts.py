from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Context

router = APIRouter(prefix="/api/contexts", tags=["contexts"])


class ContextPayload(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: str = "#2383e2"


@router.get("")
def list_contexts(db: Session = Depends(get_db)):
    return [c.to_dict() for c in db.query(Context).order_by(Context.name).all()]


@router.post("", status_code=201)
def create_context(payload: ContextPayload, db: Session = Depends(get_db)):
    if db.query(Context).filter(Context.name == payload.name).first():
        raise HTTPException(409, "Ya existe un contexto con ese nombre")
    ctx = Context(name=payload.name, color=payload.color)
    db.add(ctx)
    db.commit()
    return ctx.to_dict()


@router.put("/{ctx_id}")
def update_context(ctx_id: int, payload: ContextPayload, db: Session = Depends(get_db)):
    ctx = db.get(Context, ctx_id)
    if not ctx:
        raise HTTPException(404, "Contexto no encontrado")
    dup = db.query(Context).filter(Context.name == payload.name, Context.id != ctx_id).first()
    if dup:
        raise HTTPException(409, "Ya existe un contexto con ese nombre")
    ctx.name = payload.name
    ctx.color = payload.color
    db.commit()
    return ctx.to_dict()


@router.delete("/{ctx_id}")
def delete_context(ctx_id: int, db: Session = Depends(get_db)):
    ctx = db.get(Context, ctx_id)
    if not ctx:
        raise HTTPException(404, "Contexto no encontrado")
    db.delete(ctx)
    db.commit()
    return {"deleted": True}
