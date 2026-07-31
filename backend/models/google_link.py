from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class GoogleLink(Base):
    """Puente entre algo de HomeOS y su evento espejo en Google Calendar.

    kind es de dónde salió: evento | tarea | pago | suscripcion.
    fingerprint guarda cómo se mandó la última vez, para no repetir PATCHes
    cuando nada cambió.
    """

    __tablename__ = "google_links"
    __table_args__ = (UniqueConstraint("kind", "local_id", name="uq_google_link"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    local_id: Mapped[int] = mapped_column(Integer, nullable=False)
    google_event_id: Mapped[str] = mapped_column(String, nullable=False)
    google_calendar_id: Mapped[str] = mapped_column(String, nullable=False)
    fingerprint: Mapped[str] = mapped_column(String, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "local_id": self.local_id,
            "google_event_id": self.google_event_id,
            "google_calendar_id": self.google_calendar_id,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
