from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class Routine(Base):
    """Hábito diario: bañarse, ejercicio, completar tareas…"""

    __tablename__ = "routines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    icon: Mapped[str] = mapped_column(String, default="✅")
    active: Mapped[int] = mapped_column(Integer, default=1)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "icon": self.icon,
            "active": bool(self.active),
            "sort_order": self.sort_order,
        }


class RoutineLog(Base):
    """Un check de una rutina en un día (date_key = YYYY-MM-DD)."""

    __tablename__ = "routine_logs"
    __table_args__ = (UniqueConstraint("routine_id", "date_key", name="uq_routine_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    routine_id: Mapped[int] = mapped_column(
        ForeignKey("routines.id", ondelete="CASCADE"), nullable=False
    )
    date_key: Mapped[str] = mapped_column(String, nullable=False)
    done_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
