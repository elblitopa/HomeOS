from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class SentReminder(Base):
    """Registro de recordatorios ya enviados para no duplicar webhooks."""

    __tablename__ = "sent_reminders"
    __table_args__ = (
        UniqueConstraint("kind", "item_id", "offset_minutes", name="uq_sent_reminder"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)  # event|todo
    item_id: Mapped[int] = mapped_column(Integer, nullable=False)
    offset_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
