import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from backend.config import BANNERS_DIR, FILES_DIR, ICONS_DIR, THUMBS_DIR, UPLOADS_DIR

log = logging.getLogger("homeos.uploads")

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB para archivos de timeline

# lo que Pillow sabe encoger; el resto se sirve tal cual
THUMBABLE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"}
THUMB_SIZES = (96, 320, 640)


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


def _dentro_de_uploads(publico: str) -> Path | None:
    """Traduce /uploads/files/x.jpg a la ruta real, sin dejar salir de la carpeta."""
    limpio = publico.split("?")[0].lstrip("/")
    if not limpio.startswith("uploads/"):
        return None
    destino = (UPLOADS_DIR / limpio[len("uploads/"):]).resolve()
    if not destino.is_file() or UPLOADS_DIR.resolve() not in destino.parents:
        return None
    return destino


@router.get("/thumb")
def thumb(path: str = Query(..., description="ruta publica, ej. /uploads/files/x.jpg"),
          w: int = Query(320, description="ancho maximo")):
    """Miniatura cacheada de una imagen subida.

    Los comprobantes salen de la camara del celular y pesan varios MB; pintarlos
    a 44 px sin encogerlos primero haria que el historial de transacciones
    descargue decenas de megas. Si algo falla se sirve el original.
    """
    origen = _dentro_de_uploads(path)
    if origen is None:
        raise HTTPException(404, "Archivo no encontrado")

    ancho = min(THUMB_SIZES, key=lambda s: abs(s - w))  # se cachean pocos tamaños
    if origen.suffix.lower() not in THUMBABLE_EXT:
        return FileResponse(origen)

    cache = THUMBS_DIR / f"{ancho}_{origen.stem}.webp"
    # si el original cambió (mismo nombre, otro contenido) la miniatura se rehace
    if not cache.is_file() or cache.stat().st_mtime < origen.stat().st_mtime:
        try:
            from PIL import Image, ImageOps

            with Image.open(origen) as im:
                im = ImageOps.exif_transpose(im)  # respeta la rotación del celular
                if im.mode not in ("RGB", "RGBA"):
                    im = im.convert("RGB")
                im.thumbnail((ancho, ancho * 4), Image.LANCZOS)
                THUMBS_DIR.mkdir(parents=True, exist_ok=True)
                im.save(cache, "WEBP", quality=80, method=4)
        except Exception:
            log.warning("No se pudo generar la miniatura de %s", origen.name, exc_info=True)
            return FileResponse(origen)

    # private: los uploads son contenido autenticado (comprobantes, fotos);
    # solo el navegador del usuario puede cachearlos, jamás un cache compartido
    return FileResponse(cache, media_type="image/webp",
                        headers={"Cache-Control": "private, max-age=604800"})


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
