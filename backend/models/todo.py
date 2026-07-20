from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class Todo(Base):
    __tablename__ = "todos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_id: Mapped[int | None] = mapped_column(
        ForeignKey("contexts.id", ondelete="SET NULL"), nullable=True
    )
    # 1=baja, 2=media, 3=alta, 4=urgente
    priority: Mapped[int] = mapped_column(Integer, default=2)
    status: Mapped[str] = mapped_column(String, default="pendiente")  # pendiente|completada
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reminders: Mapped[list | None] = mapped_column(JSON, default=list)  # minutos antes del due_date
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    entries: Mapped[list["TodoEntry"]] = relationship(
        back_populates="todo", cascade="all, delete-orphan", order_by="TodoEntry.created_at"
    )

    def to_dict(self, with_entries: bool = False) -> dict:
        data = {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "context_id": self.context_id,
            "priority": self.priority,
            "status": self.status,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "reminders": self.reminders or [],
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
        if with_entries:
            data["entries"] = [e.to_dict() for e in self.entries]
        return data


class TodoEntry(Base):
    """Nota o archivo en la línea de tiempo de una tarea."""

    __tablename__ = "todo_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    todo_id: Mapped[int] = mapped_column(
        ForeignKey("todos.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String, default="nota")  # nota|archivo
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_path: Mapped[str | None] = mapped_column(String, nullable=True)
    file_name: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    todo: Mapped[Todo] = relationship(back_populates="entries")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "text": self.text,
            "file_path": self.file_path,
            "file_name": self.file_name,
            "created_at": self.created_at.isoformat(),
        }
