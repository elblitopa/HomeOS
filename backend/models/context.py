from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class Context(Base):
    """Vista/ámbito para filtrar tareas y eventos: Personal, Negocio X, Proyecto Y.

    Un negocio ES un contexto con la palomita is_business: así todo lo que ya
    se etiqueta por contexto (tareas, notas, transacciones, proveedores…)
    pertenece al negocio sin duplicar el concepto. La palomita solo decide si
    sale como tarjeta en la sección Negocios; los endpoints no la validan.
    """

    __tablename__ = "contexts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    color: Mapped[str] = mapped_column(String, default="#2383e2")
    is_business: Mapped[int] = mapped_column(Integer, default=0)
    # el negocio tiene la seccion Agenda (eventos de clientes). Es una
    # palomita y no un framework de secciones: hoy solo la usa Renta Bocinas
    has_agenda: Mapped[int] = mapped_column(Integer, default=0)
    banner_path: Mapped[str | None] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "color": self.color,
            "is_business": bool(self.is_business),
            "has_agenda": bool(self.has_agenda),
            "banner_path": self.banner_path,
            "sort_order": self.sort_order,
        }
