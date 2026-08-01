from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Context

router = APIRouter(prefix="/api/contexts", tags=["contexts"])


class ContextPayload(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: str = "#2383e2"
    # None = no tocar. Importa en el PUT: Ajustes edita solo nombre/color, y un
    # default fijo le borraría la palomita y el banner a un negocio al renombrarlo.
    is_business: bool | None = None
    banner_path: str | None = None


class ReorderPayload(BaseModel):
    ids: list[int]


@router.get("")
def list_contexts(db: Session = Depends(get_db)):
    return [
        c.to_dict()
        for c in db.query(Context).order_by(Context.sort_order, Context.name).all()
    ]


@router.post("", status_code=201)
def create_context(payload: ContextPayload, db: Session = Depends(get_db)):
    if db.query(Context).filter(Context.name == payload.name).first():
        raise HTTPException(409, "Ya existe un contexto con ese nombre")
    ctx = Context(
        name=payload.name,
        color=payload.color,
        is_business=1 if payload.is_business else 0,
        banner_path=payload.banner_path,
    )
    db.add(ctx)
    db.commit()
    return ctx.to_dict()


@router.post("/reorder")
def reorder_contexts(payload: ReorderPayload, db: Session = Depends(get_db)):
    """Guarda el acomodo de las tarjetas de negocios (drag & drop)."""
    contexts = {c.id: c for c in db.query(Context).all()}
    for index, ctx_id in enumerate(payload.ids):
        ctx = contexts.get(ctx_id)
        if ctx:
            ctx.sort_order = index
    db.commit()
    return {"ordered": len(payload.ids)}


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
    # solo lo que venga en la peticion; banner_path: null explicito si lo quita
    data = payload.model_dump(exclude_unset=True)
    if "is_business" in data and data["is_business"] is not None:
        ctx.is_business = 1 if data["is_business"] else 0
    if "banner_path" in data:
        ctx.banner_path = data["banner_path"]
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
