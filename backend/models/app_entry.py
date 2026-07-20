from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class AppEntry(Base):
    __tablename__ = "apps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    folder: Mapped[str] = mapped_column(String, nullable=False)
    launcher: Mapped[str] = mapped_column(String, nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    icon_path: Mapped[str | None] = mapped_column(String, nullable=True)
    banner_path: Mapped[str | None] = mapped_column(String, nullable=True)
    accent: Mapped[str] = mapped_column(String, default="#2383e2")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    last_pid: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "folder": self.folder,
            "launcher": self.launcher,
            "port": self.port,
            "icon_path": self.icon_path,
            "banner_path": self.banner_path,
            "accent": self.accent,
            "sort_order": self.sort_order,
            "last_started_at": self.last_started_at.isoformat() if self.last_started_at else None,
        }
