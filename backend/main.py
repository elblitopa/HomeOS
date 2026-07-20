import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from backend import config
from backend.database import Base, SessionLocal, engine
import backend.models  # noqa: F401  (registra los modelos en Base.metadata)
from backend.models import Category, DEFAULT_CATEGORIES
from backend.routers import (
    apps,
    business,
    contexts,
    events,
    finance,
    settings,
    system,
    todos,
    uploads,
)
from backend.routers.apps import run_manifest_import
from backend.services.scheduler import reminder_loop

config.ensure_dirs()
Base.metadata.create_all(engine)

with SessionLocal() as db:
    run_manifest_import(db)
    if not db.query(Category).first():
        for name, icon in DEFAULT_CATEGORIES:
            db.add(Category(name=name, icon=icon, is_default=1))
        db.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(reminder_loop())
    yield
    task.cancel()


app = FastAPI(title="HomeOS", version=config.VERSION, lifespan=lifespan)

app.include_router(apps.router)
app.include_router(contexts.router)
app.include_router(todos.router)
app.include_router(events.router)
app.include_router(finance.router)
app.include_router(business.router)
app.include_router(settings.router)
app.include_router(uploads.router)
app.include_router(system.router)

app.mount("/uploads", StaticFiles(directory=config.UPLOADS_DIR), name="uploads")

if (config.FRONTEND_DIST / "assets").is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=config.FRONTEND_DIST / "assets"),
        name="assets",
    )


# SPA fallback: siempre al final para no tapar /api ni los mounts estaticos.
# no-cache en el index: el navegador siempre revalida y toma el build nuevo
# (los assets sí se cachean porque su nombre lleva hash).
@app.get("/{full_path:path}")
def spa(full_path: str):
    index = config.FRONTEND_DIST / "index.html"
    if index.is_file():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return HTMLResponse(
        "<h1>HomeOS</h1><p>Frontend no compilado. Corre <code>build.bat</code>.</p>"
    )
