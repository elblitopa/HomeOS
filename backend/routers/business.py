from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import BizDoc, BizMessage, BusinessInfo, Competitor, Provider

router = APIRouter(prefix="/api/business", tags=["business"])


# ---------- proveedores ----------

class ProviderPayload(BaseModel):
    name: str = Field(min_length=1)
    phone: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    website: str | None = None
    links: list = []
    attachments: list = []
    notes: str | None = None
    context_id: int | None = None


@router.get("/providers")
def list_providers(context_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Provider)
    if context_id:
        q = q.filter(Provider.context_id == context_id)
    return [p.to_dict() for p in q.order_by(Provider.name).all()]


@router.post("/providers", status_code=201)
def create_provider(payload: ProviderPayload, db: Session = Depends(get_db)):
    provider = Provider(**payload.model_dump())
    db.add(provider)
    db.commit()
    return provider.to_dict()


@router.put("/providers/{provider_id}")
def update_provider(provider_id: int, payload: ProviderPayload, db: Session = Depends(get_db)):
    provider = db.get(Provider, provider_id)
    if not provider:
        raise HTTPException(404, "Proveedor no encontrado")
    for key, value in payload.model_dump().items():
        setattr(provider, key, value)
    db.commit()
    return provider.to_dict()


@router.delete("/providers/{provider_id}")
def delete_provider(provider_id: int, db: Session = Depends(get_db)):
    provider = db.get(Provider, provider_id)
    if not provider:
        raise HTTPException(404, "Proveedor no encontrado")
    db.delete(provider)
    db.commit()
    return {"deleted": True}


# ---------- competidores ----------

class CompetitorPayload(BaseModel):
    context_id: int
    name: str = Field(min_length=1)
    ads_url: str | None = None
    website: str | None = None
    socials: str | None = None
    locations: str | None = None
    notes: str | None = None


@router.get("/competitors")
def list_competitors(context_id: int, db: Session = Depends(get_db)):
    q = db.query(Competitor).filter(Competitor.context_id == context_id)
    return [c.to_dict() for c in q.order_by(Competitor.name).all()]


@router.post("/competitors", status_code=201)
def create_competitor(payload: CompetitorPayload, db: Session = Depends(get_db)):
    comp = Competitor(**payload.model_dump())
    db.add(comp)
    db.commit()
    return comp.to_dict()


@router.put("/competitors/{comp_id}")
def update_competitor(comp_id: int, payload: CompetitorPayload, db: Session = Depends(get_db)):
    comp = db.get(Competitor, comp_id)
    if not comp:
        raise HTTPException(404, "Competidor no encontrado")
    for key, value in payload.model_dump().items():
        setattr(comp, key, value)
    db.commit()
    return comp.to_dict()


@router.delete("/competitors/{comp_id}")
def delete_competitor(comp_id: int, db: Session = Depends(get_db)):
    comp = db.get(Competitor, comp_id)
    if not comp:
        raise HTTPException(404, "Competidor no encontrado")
    db.delete(comp)
    db.commit()
    return {"deleted": True}


# ---------- mensajes automatizados ----------

class MessagePayload(BaseModel):
    context_id: int
    title: str = Field(min_length=1)
    body: str = Field(min_length=1)


@router.get("/messages")
def list_messages(context_id: int, db: Session = Depends(get_db)):
    q = db.query(BizMessage).filter(BizMessage.context_id == context_id)
    return [m.to_dict() for m in q.order_by(BizMessage.title).all()]


@router.post("/messages", status_code=201)
def create_message(payload: MessagePayload, db: Session = Depends(get_db)):
    msg = BizMessage(**payload.model_dump())
    db.add(msg)
    db.commit()
    return msg.to_dict()


@router.put("/messages/{msg_id}")
def update_message(msg_id: int, payload: MessagePayload, db: Session = Depends(get_db)):
    msg = db.get(BizMessage, msg_id)
    if not msg:
        raise HTTPException(404, "Mensaje no encontrado")
    for key, value in payload.model_dump().items():
        setattr(msg, key, value)
    db.commit()
    return msg.to_dict()


@router.delete("/messages/{msg_id}")
def delete_message(msg_id: int, db: Session = Depends(get_db)):
    msg = db.get(BizMessage, msg_id)
    if not msg:
        raise HTTPException(404, "Mensaje no encontrado")
    db.delete(msg)
    db.commit()
    return {"deleted": True}


# ---------- documentos ----------

class DocPayload(BaseModel):
    context_id: int
    file_path: str
    file_name: str


@router.get("/docs")
def list_docs(context_id: int, db: Session = Depends(get_db)):
    q = db.query(BizDoc).filter(BizDoc.context_id == context_id)
    return [d.to_dict() for d in q.order_by(BizDoc.created_at.desc()).all()]


@router.post("/docs", status_code=201)
def create_doc(payload: DocPayload, db: Session = Depends(get_db)):
    doc = BizDoc(**payload.model_dump())
    db.add(doc)
    db.commit()
    return doc.to_dict()


@router.delete("/docs/{doc_id}")
def delete_doc(doc_id: int, db: Session = Depends(get_db)):
    doc = db.get(BizDoc, doc_id)
    if not doc:
        raise HTTPException(404, "Documento no encontrado")
    db.delete(doc)
    db.commit()
    return {"deleted": True}


# ---------- manual / notas del negocio ----------

class InfoPayload(BaseModel):
    manual: str = ""
    notes: str = ""


@router.get("/info/{context_id}")
def get_info(context_id: int, db: Session = Depends(get_db)):
    info = db.get(BusinessInfo, context_id)
    return info.to_dict() if info else {"context_id": context_id, "manual": "", "notes": ""}


@router.put("/info/{context_id}")
def put_info(context_id: int, payload: InfoPayload, db: Session = Depends(get_db)):
    info = db.get(BusinessInfo, context_id)
    if not info:
        info = BusinessInfo(context_id=context_id)
        db.add(info)
    info.manual = payload.manual
    info.notes = payload.notes
    db.commit()
    return info.to_dict()
