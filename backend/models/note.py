from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class Note(Base):
    """Nota de texto o de audio."""

    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_path: Mapped[str | None] = mapped_column(String, nullable=True)
    context_id: Mapped[int | None] = mapped_column(
        ForeignKey("contexts.id", ondelete="SET NULL"), nullable=True
    )
    pinned: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, onupdate=datetime.now
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "audio_path": self.audio_path,
            "context_id": self.context_id,
            "pinned": bool(self.pinned),
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
