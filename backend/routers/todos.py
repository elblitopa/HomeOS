from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models import Todo, TodoEntry

router = APIRouter(prefix="/api/todos", tags=["todos"])


class TodoPayload(BaseModel):
    title: str = Field(min_length=1)
    description: str | None = None
    context_id: int | None = None
    priority: int = Field(default=2, ge=1, le=4)
    due_date: datetime | None = None
    reminders: list[int] = []


class TodoUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    context_id: int | None = None
    priority: int | None = Field(default=None, ge=1, le=4)
    due_date: datetime | None = None
    reminders: list[int] | None = None


class EntryPayload(BaseModel):
    kind: str = "nota"  # nota|archivo
    text: str | None = None
    file_path: str | None = None
    file_name: str | None = None


@router.get("")
def list_todos(
    status: str | None = None,
    context_id: int | None = None,
    priority: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Todo)
    if status:
        q = q.filter(Todo.status == status)
    if context_id:
        q = q.filter(Todo.context_id == context_id)
    if priority:
        q = q.filter(Todo.priority == priority)
    # urgentes primero, luego por due date más próximo, luego recientes
    todos = q.all()
    todos.sort(
        key=lambda t: (
            t.status == "completada",
            -t.priority,
            t.due_date or datetime.max,
            -t.id,
        )
    )
    return [t.to_dict() for t in todos]


@router.get("/{todo_id}")
def get_todo(todo_id: int, db: Session = Depends(get_db)):
    todo = (
        db.query(Todo).options(joinedload(Todo.entries)).filter(Todo.id == todo_id).first()
    )
    if not todo:
        raise HTTPException(404, "Tarea no encontrada")
    return todo.to_dict(with_entries=True)


@router.post("", status_code=201)
def create_todo(payload: TodoPayload, db: Session = Depends(get_db)):
    todo = Todo(**payload.model_dump())
    db.add(todo)
    db.commit()
    return todo.to_dict()


@router.put("/{todo_id}")
def update_todo(todo_id: int, payload: TodoUpdate, db: Session = Depends(get_db)):
    todo = db.get(Todo, todo_id)
    if not todo:
        raise HTTPException(404, "Tarea no encontrada")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(todo, key, value)
    db.commit()
    return todo.to_dict()


@router.post("/{todo_id}/toggle")
def toggle_todo(todo_id: int, db: Session = Depends(get_db)):
    todo = db.get(Todo, todo_id)
    if not todo:
        raise HTTPException(404, "Tarea no encontrada")
    if todo.status == "pendiente":
        todo.status = "completada"
        todo.completed_at = datetime.now()
    else:
        todo.status = "pendiente"
        todo.completed_at = None
    db.commit()
    return todo.to_dict()


@router.delete("/{todo_id}")
def delete_todo(todo_id: int, db: Session = Depends(get_db)):
    todo = db.get(Todo, todo_id)
    if not todo:
        raise HTTPException(404, "Tarea no encontrada")
    db.delete(todo)
    db.commit()
    return {"deleted": True}


@router.post("/{todo_id}/entries", status_code=201)
def add_entry(todo_id: int, payload: EntryPayload, db: Session = Depends(get_db)):
    todo = db.get(Todo, todo_id)
    if not todo:
        raise HTTPException(404, "Tarea no encontrada")
    if payload.kind == "nota" and not (payload.text or "").strip():
        raise HTTPException(400, "La nota no puede estar vacía")
    if payload.kind == "archivo" and not payload.file_path:
        raise HTTPException(400, "Falta el archivo")
    entry = TodoEntry(todo_id=todo_id, **payload.model_dump())
    db.add(entry)
    db.commit()
    return entry.to_dict()


@router.delete("/{todo_id}/entries/{entry_id}")
def delete_entry(todo_id: int, entry_id: int, db: Session = Depends(get_db)):
    entry = db.get(TodoEntry, entry_id)
    if not entry or entry.todo_id != todo_id:
        raise HTTPException(404, "Entrada no encontrada")
    db.delete(entry)
    db.commit()
    return {"deleted": True}
