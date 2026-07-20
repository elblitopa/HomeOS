import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.config import FILES_DIR
from backend.database import get_db
from backend.models import FileEntry, kind_for

router = APIRouter(prefix="/api/files", tags=["files"])

MAX_SIZE = 500 * 1024 * 1024  # 500 MB
BLOCKED_EXT = {".exe", ".bat", ".cmd", ".ps1", ".msi", ".scr"}


@router.get("")
def list_files(kind: str | None = None, db: Session = Depends(get_db)):
    q = db.query(FileEntry)
    if kind:
        q = q.filter(FileEntry.kind == kind)
    return [f.to_dict() for f in q.order_by(FileEntry.created_at.desc()).all()]


@router.post("", status_code=201)
async def upload(file: UploadFile, db: Session = Depends(get_db)):
    original = Path(file.filename or "archivo").name
    ext = Path(original).suffix.lower()
    if ext in BLOCKED_EXT:
        raise HTTPException(400, f"Tipo de archivo no permitido: {ext}")
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "Archivo demasiado grande (max 500 MB)")
    name = f"{uuid.uuid4().hex}{ext}"
    (FILES_DIR / name).write_bytes(content)
    entry = FileEntry(
        file_path=f"/uploads/files/{name}",
        file_name=original,
        kind=kind_for(ext),
        size=len(content),
    )
    db.add(entry)
    db.commit()
    return entry.to_dict()


@router.delete("/{file_id}")
def delete_file(file_id: int, db: Session = Depends(get_db)):
    entry = db.get(FileEntry, file_id)
    if not entry:
        raise HTTPException(404, "Archivo no encontrado")
    # borrar del disco solo dentro de FILES_DIR
    disk = FILES_DIR / Path(entry.file_path).name
    if disk.is_file():
        try:
            disk.unlink()
        except OSError:
            pass
    db.delete(entry)
    db.commit()
    return {"deleted": True}
