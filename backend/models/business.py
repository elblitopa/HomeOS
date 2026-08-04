from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class Provider(Base):
    """Proveedor: contacto, links, catálogos adjuntos."""

    __tablename__ = "providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    website: Mapped[str | None] = mapped_column(String, nullable=True)
    links: Mapped[list | None] = mapped_column(JSON, default=list)  # [{label, url}]
    attachments: Mapped[list | None] = mapped_column(JSON, default=list)  # [{path, name}]
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)  # compras, condiciones, etc.
    context_id: Mapped[int | None] = mapped_column(
        ForeignKey("contexts.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "phone": self.phone,
            "whatsapp": self.whatsapp,
            "email": self.email,
            "website": self.website,
            "links": self.links or [],
            "attachments": self.attachments or [],
            "notes": self.notes,
            "context_id": self.context_id,
        }


class Competitor(Base):
    """Mapa de competidores de un negocio."""

    __tablename__ = "competitors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    context_id: Mapped[int] = mapped_column(
        ForeignKey("contexts.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    ads_url: Mapped[str | None] = mapped_column(String, nullable=True)  # biblioteca de anuncios
    website: Mapped[str | None] = mapped_column(String, nullable=True)
    socials: Mapped[str | None] = mapped_column(Text, nullable=True)
    locations: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "context_id": self.context_id,
            "name": self.name,
            "ads_url": self.ads_url,
            "website": self.website,
            "socials": self.socials,
            "locations": self.locations,
            "notes": self.notes,
        }


class BizMessage(Base):
    """Mensaje automatizado / plantilla para cada ocasión."""

    __tablename__ = "biz_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    context_id: Mapped[int] = mapped_column(
        ForeignKey("contexts.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "context_id": self.context_id,
            "title": self.title,
            "body": self.body,
        }


class BizDoc(Base):
    """Documento subido de un negocio."""

    __tablename__ = "biz_docs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    context_id: Mapped[int] = mapped_column(
        ForeignKey("contexts.id", ondelete="CASCADE"), nullable=False
    )
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    file_name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "context_id": self.context_id,
            "file_path": self.file_path,
            "file_name": self.file_name,
            "created_at": self.created_at.isoformat(),
        }


class ContentIdea(Base):
    """Idea/video del pipeline de creación de contenidos de un negocio."""

    __tablename__ = "content_ideas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    context_id: Mapped[int] = mapped_column(
        ForeignKey("contexts.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    # idea | guion | grabando | editando | listo | publicado
    status: Mapped[str] = mapped_column(String, default="idea")
    # entretenimiento | shorts | largos | anuncios
    format: Mapped[str | None] = mapped_column(String, nullable=True)
    publish_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    inspiration_url: Mapped[str | None] = mapped_column(String, nullable=True)
    drive_url: Mapped[str | None] = mapped_column(String, nullable=True)
    platforms: Mapped[list | None] = mapped_column(JSON, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, onupdate=datetime.now
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "context_id": self.context_id,
            "title": self.title,
            "status": self.status,
            "format": self.format,
            "publish_date": self.publish_date.isoformat() if self.publish_date else None,
            "inspiration_url": self.inspiration_url,
            "drive_url": self.drive_url,
            "platforms": self.platforms or [],
            "notes": self.notes,
            "sort_order": self.sort_order,
        }


class BusinessProject(Base):
    """Proyecto/pendiente de un negocio (la matriz de proyectos).

    Aparte de los Todos personales a propósito: aquí el progreso tiene tres
    estados (no dos), y lleva área, estrategia y clientes, que en una tarea
    personal no significan nada.
    """

    __tablename__ = "business_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    context_id: Mapped[int] = mapped_column(
        ForeignKey("contexts.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    priority: Mapped[str] = mapped_column(String, default="P2")  # P1 | P2 | P3
    # sin_empezar | en_curso | terminado
    progress: Mapped[str] = mapped_column(String, default="sin_empezar")
    area: Mapped[str | None] = mapped_column(String, nullable=True)  # Marketing, Desarrollo…
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    strategy: Mapped[str | None] = mapped_column(Text, nullable=True)
    clients: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, onupdate=datetime.now
    )

    def to_dict(self) -> dict:
        days_left = None
        if self.due_date:
            days_left = (self.due_date.date() - datetime.now().date()).days
        return {
            "id": self.id,
            "context_id": self.context_id,
            "title": self.title,
            "priority": self.priority,
            "progress": self.progress,
            "area": self.area,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "days_left": days_left,
            "strategy": self.strategy,
            "clients": self.clients,
            "sort_order": self.sort_order,
        }


class BusinessEvent(Base):
    """Evento agendado con un cliente (la Agenda del negocio).

    No es un BusinessProject (pendiente interno) ni un Event (calendario
    personal): una reserva tiene cliente, monto, anticipo y equipo rentado.
    """

    __tablename__ = "business_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    context_id: Mapped[int] = mapped_column(
        ForeignKey("contexts.id", ondelete="CASCADE"), nullable=False
    )
    client_name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    amount: Mapped[float] = mapped_column(Float, default=0.0)  # a cobrar, MXN
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    start: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    image_path: Mapped[str | None] = mapped_column(String, nullable=True)
    place: Mapped[str | None] = mapped_column(String, nullable=True)
    place_url: Mapped[str | None] = mapped_column(String, nullable=True)  # link de maps
    municipality: Mapped[str | None] = mapped_column(String, nullable=True)
    rentals: Mapped[list | None] = mapped_column(JSON, default=list)  # ["2 Bocinas", ...]
    # anticipo variable ($100, $200...); reservado = anticipo > 0
    deposit: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "context_id": self.context_id,
            "client_name": self.client_name,
            "phone": self.phone,
            "amount": self.amount,
            "comments": self.comments,
            "start": self.start.isoformat(),
            "end": self.end.isoformat() if self.end else None,
            "image_path": self.image_path,
            "place": self.place,
            "place_url": self.place_url,
            "municipality": self.municipality,
            "rentals": self.rentals or [],
            "deposit": self.deposit,
            # derivado aqui para que las vistas y el calendario no repitan la regla
            "reserved": (self.deposit or 0) > 0,
            "days_left": (self.start.date() - datetime.now().date()).days,
        }


class BusinessInfo(Base):
    """Manual de procesos, notas y metadatos sueltos por negocio."""

    __tablename__ = "business_info"

    context_id: Mapped[int] = mapped_column(
        ForeignKey("contexts.id", ondelete="CASCADE"), primary_key=True
    )
    manual: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # banner de cada tarjeta de seccion del detalle: {"proyectos": "/uploads/..."}
    section_banners: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # catalogo de renta de la Agenda. None = nunca configurado (el GET responde
    # el default sin persistir); [] = el usuario borro todas, y se respeta
    agenda_options: Mapped[list | None] = mapped_column(JSON, nullable=True)

    def to_dict(self) -> dict:
        return {
            "context_id": self.context_id,
            "manual": self.manual or "",
            "notes": self.notes or "",
            "section_banners": self.section_banners or {},
            "agenda_options": self.agenda_options,
        }
