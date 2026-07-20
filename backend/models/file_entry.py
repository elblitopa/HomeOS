from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".heic"}
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv", ".avi"}
AUDIO_EXT = {".mp3", ".wav", ".ogg", ".m4a", ".webm.audio", ".aac", ".opus"}


def kind_for(ext: str) -> str:
    ext = ext.lower()
    if ext in IMAGE_EXT:
        return "imagen"
    if ext in VIDEO_EXT:
        return "video"
    if ext in AUDIO_EXT:
        return "audio"
    return "documento"


class FileEntry(Base):
    """Archivo de la biblioteca (fotos, videos, documentos…)."""

    __tablename__ = "files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    file_name: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[str] = mapped_column(String, default="documento")
    size: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "file_path": self.file_path,
            "file_name": self.file_name,
            "kind": self.kind,
            "size": self.size,
            "created_at": self.created_at.isoformat(),
        }
