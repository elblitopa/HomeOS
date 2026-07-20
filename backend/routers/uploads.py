import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

from backend.config import BANNERS_DIR, FILES_DIR, ICONS_DIR

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB para archivos de timeline


async def _save(file: UploadFile, target_dir: Path, kind: str) -> dict:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Formato no permitido: {ext or '(sin extension)'}")
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "Archivo demasiado grande (max 10 MB)")
    name = f"{uuid.uuid4().hex}{ext}"
    (target_dir / name).write_bytes(content)
    return {"path": f"/uploads/{kind}/{name}"}


@router.post("/icon")
async def upload_icon(file: UploadFile):
    return await _save(file, ICONS_DIR, "icons")


@router.post("/banner")
async def upload_banner(file: UploadFile):
    return await _save(file, BANNERS_DIR, "banners")


@router.post("/file")
async def upload_file(file: UploadFile):
    """Archivo genérico (timeline de tareas, etc.). Conserva el nombre original."""
    original = Path(file.filename or "archivo").name
    ext = Path(original).suffix.lower()
    if ext in {".exe", ".bat", ".cmd", ".ps1", ".msi", ".scr"}:
        raise HTTPException(400, f"Tipo de archivo no permitido: {ext}")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "Archivo demasiado grande (max 100 MB)")
    name = f"{uuid.uuid4().hex}{ext}"
    (FILES_DIR / name).write_bytes(content)
    return {"path": f"/uploads/files/{name}", "file_name": original}
