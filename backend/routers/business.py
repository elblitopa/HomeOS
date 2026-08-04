from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    BizDoc,
    BizMessage,
    BusinessEvent,
    BusinessInfo,
    BusinessProject,
    Competitor,
    ContentIdea,
    Provider,
)

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


# ---------- creación de contenidos ----------

CONTENT_STATUSES = {"idea", "guion", "grabando", "editando", "listo", "publicado"}


class ContentPayload(BaseModel):
    context_id: int
    title: str = Field(min_length=1)
    status: str = "idea"
    format: str | None = None
    publish_date: datetime | None = None
    inspiration_url: str | None = None
    drive_url: str | None = None
    platforms: list[str] = []
    notes: str | None = None
    sort_order: int = 0


class ContentStatusPayload(BaseModel):
    status: str


@router.get("/content")
def list_content(context_id: int, db: Session = Depends(get_db)):
    q = db.query(ContentIdea).filter(ContentIdea.context_id == context_id)
    items = q.order_by(ContentIdea.sort_order, ContentIdea.updated_at.desc()).all()
    return [c.to_dict() for c in items]


@router.post("/content", status_code=201)
def create_content(payload: ContentPayload, db: Session = Depends(get_db)):
    if payload.status not in CONTENT_STATUSES:
        raise HTTPException(400, "Status inválido")
    idea = ContentIdea(**payload.model_dump())
    db.add(idea)
    db.commit()
    return idea.to_dict()


@router.put("/content/{idea_id}")
def update_content(idea_id: int, payload: ContentPayload, db: Session = Depends(get_db)):
    idea = db.get(ContentIdea, idea_id)
    if not idea:
        raise HTTPException(404, "Idea no encontrada")
    if payload.status not in CONTENT_STATUSES:
        raise HTTPException(400, "Status inválido")
    for key, value in payload.model_dump().items():
        setattr(idea, key, value)
    db.commit()
    return idea.to_dict()


@router.post("/content/{idea_id}/status")
def move_content(idea_id: int, payload: ContentStatusPayload, db: Session = Depends(get_db)):
    """Mover de columna (drag & drop del kanban)."""
    idea = db.get(ContentIdea, idea_id)
    if not idea:
        raise HTTPException(404, "Idea no encontrada")
    if payload.status not in CONTENT_STATUSES:
        raise HTTPException(400, "Status inválido")
    idea.status = payload.status
    db.commit()
    return idea.to_dict()


@router.delete("/content/{idea_id}")
def delete_content(idea_id: int, db: Session = Depends(get_db)):
    idea = db.get(ContentIdea, idea_id)
    if not idea:
        raise HTTPException(404, "Idea no encontrada")
    db.delete(idea)
    db.commit()
    return {"deleted": True}


# ---------- proyectos (la matriz de pendientes del negocio) ----------

PROJECT_PRIORITIES = {"P1", "P2", "P3"}
PROJECT_PROGRESS = {"sin_empezar", "en_curso", "terminado"}


class ProjectPayload(BaseModel):
    context_id: int
    title: str = Field(min_length=1)
    priority: str = "P2"
    progress: str = "sin_empezar"
    area: str | None = None
    due_date: datetime | None = None
    strategy: str | None = None
    clients: str | None = None
    sort_order: int = 0


class ProjectProgressPayload(BaseModel):
    progress: str


class ProjectReorderPayload(BaseModel):
    ids: list[int]


def _validar_proyecto(payload: ProjectPayload) -> None:
    if payload.priority not in PROJECT_PRIORITIES:
        raise HTTPException(400, "Prioridad inválida: usa P1, P2 o P3")
    if payload.progress not in PROJECT_PROGRESS:
        raise HTTPException(400, "Progreso inválido")


@router.get("/projects")
def list_projects(context_id: int, db: Session = Depends(get_db)):
    q = db.query(BusinessProject).filter(BusinessProject.context_id == context_id)
    items = q.order_by(BusinessProject.sort_order, BusinessProject.created_at).all()
    return [p.to_dict() for p in items]


@router.post("/projects", status_code=201)
def create_project(payload: ProjectPayload, db: Session = Depends(get_db)):
    _validar_proyecto(payload)
    proyecto = BusinessProject(**payload.model_dump())
    db.add(proyecto)
    db.commit()
    return proyecto.to_dict()


@router.put("/projects/{project_id}")
def update_project(project_id: int, payload: ProjectPayload, db: Session = Depends(get_db)):
    proyecto = db.get(BusinessProject, project_id)
    if not proyecto:
        raise HTTPException(404, "Proyecto no encontrado")
    _validar_proyecto(payload)
    for key, value in payload.model_dump().items():
        setattr(proyecto, key, value)
    db.commit()
    return proyecto.to_dict()


@router.post("/projects/{project_id}/progress")
def move_project(project_id: int, payload: ProjectProgressPayload, db: Session = Depends(get_db)):
    """Mover de columna (drag & drop del tablero)."""
    proyecto = db.get(BusinessProject, project_id)
    if not proyecto:
        raise HTTPException(404, "Proyecto no encontrado")
    if payload.progress not in PROJECT_PROGRESS:
        raise HTTPException(400, "Progreso inválido")
    proyecto.progress = payload.progress
    db.commit()
    return proyecto.to_dict()


@router.post("/projects/reorder")
def reorder_projects(payload: ProjectReorderPayload, db: Session = Depends(get_db)):
    """Guarda el acomodo de la matriz (drag & drop)."""
    proyectos = {p.id: p for p in db.query(BusinessProject).all()}
    for index, project_id in enumerate(payload.ids):
        proyecto = proyectos.get(project_id)
        if proyecto:
            proyecto.sort_order = index
    db.commit()
    return {"ordered": len(payload.ids)}


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    proyecto = db.get(BusinessProject, project_id)
    if not proyecto:
        raise HTTPException(404, "Proyecto no encontrado")
    db.delete(proyecto)
    db.commit()
    return {"deleted": True}


# ---------- agenda de eventos (clientes) ----------

class EventPayload(BaseModel):
    context_id: int
    client_name: str = Field(min_length=1)
    phone: str | None = None
    amount: float = Field(default=0, ge=0)
    comments: str | None = None
    start: datetime
    end: datetime | None = None
    image_path: str | None = None
    place: str | None = None
    place_url: str | None = None
    municipality: str | None = None
    rentals: list[str] = []
    deposit: float = Field(default=0, ge=0)


def _validar_evento(payload: EventPayload) -> None:
    if payload.end and payload.end <= payload.start:
        raise HTTPException(400, "El fin debe ser después del inicio")


@router.get("/events")
def list_events(
    context_id: int,
    desde: datetime | None = Query(default=None, alias="from"),
    hasta: datetime | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
):
    q = db.query(BusinessEvent).filter(BusinessEvent.context_id == context_id)
    if desde:
        q = q.filter(BusinessEvent.start >= desde)
    if hasta:
        q = q.filter(BusinessEvent.start < hasta)
    return [e.to_dict() for e in q.order_by(BusinessEvent.start).all()]


@router.post("/events", status_code=201)
def create_event(payload: EventPayload, db: Session = Depends(get_db)):
    _validar_evento(payload)
    evento = BusinessEvent(**payload.model_dump())
    db.add(evento)
    db.commit()
    return evento.to_dict()


@router.put("/events/{event_id}")
def update_event(event_id: int, payload: EventPayload, db: Session = Depends(get_db)):
    evento = db.get(BusinessEvent, event_id)
    if not evento:
        raise HTTPException(404, "Evento no encontrado")
    _validar_evento(payload)
    for key, value in payload.model_dump().items():
        setattr(evento, key, value)
    db.commit()
    return evento.to_dict()


@router.delete("/events/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db)):
    evento = db.get(BusinessEvent, event_id)
    if not evento:
        raise HTTPException(404, "Evento no encontrado")
    db.delete(evento)
    db.commit()
    return {"deleted": True}


# ---------- manual / notas / metadatos del negocio ----------

# lo que trae la Agenda de fabrica; se responde sin persistir mientras el
# usuario no edite el catalogo (None = nunca configurado, [] = borro todas)
DEFAULT_AGENDA_OPTIONS = ["1 Bocina", "2 Bocinas", "Mezcladora", "Iluminación", "Micrófono"]


class InfoPayload(BaseModel):
    # todos opcionales: cada seccion guarda SOLO lo suyo. Sin exclude_unset,
    # guardar el Manual pisaria los banners de seccion y el catalogo de renta.
    manual: str | None = None
    notes: str | None = None
    section_banners: dict[str, str] | None = None
    agenda_options: list[str] | None = None


def _info_dict(info: BusinessInfo | None, context_id: int) -> dict:
    base = info.to_dict() if info else {
        "context_id": context_id,
        "manual": "",
        "notes": "",
        "section_banners": {},
        "agenda_options": None,
    }
    if base["agenda_options"] is None:
        base["agenda_options"] = DEFAULT_AGENDA_OPTIONS
    return base


@router.get("/info/{context_id}")
def get_info(context_id: int, db: Session = Depends(get_db)):
    return _info_dict(db.get(BusinessInfo, context_id), context_id)


@router.put("/info/{context_id}")
def put_info(context_id: int, payload: InfoPayload, db: Session = Depends(get_db)):
    info = db.get(BusinessInfo, context_id)
    if not info:
        info = BusinessInfo(context_id=context_id)
        db.add(info)
    data = payload.model_dump(exclude_unset=True)
    for key in ("manual", "notes", "section_banners", "agenda_options"):
        if key in data:
            # asignacion completa a proposito: SQLAlchemy no detecta
            # mutaciones in-place de columnas JSON
            setattr(info, key, data[key])
    db.commit()
    return _info_dict(info, context_id)
