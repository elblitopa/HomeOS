import asyncio
import logging
import mimetypes
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

# algunos sistemas (el contenedor incluido) no traen el mapping de webp y las
# miniaturas saldrían como application/octet-stream desde el mount estático
mimetypes.add_type("image/webp", ".webp")

from backend import auth, config
from backend.database import Base, SessionLocal, engine, ensure_columns
import backend.models  # noqa: F401  (registra los modelos en Base.metadata)
from backend.models import Category, DEFAULT_CATEGORIES
from backend.routers import (
    agent_bridge,
    agents,
    apps,
    business,
    calendar_agenda,
    contexts,
    events,
    files,
    finance,
    google,
    notes,
    routines,
    settings,
    system,
    todos,
    uploads,
)
from backend.routers.apps import run_manifest_import
from backend.services import fx
from backend.services.scheduler import reminder_loop

# los loggers propios (homeos.*) a INFO: sin esto el root logger queda en
# WARNING y el "scheduler iniciado" jamás aparecería en docker logs. Formato
# corto y sin datos sensibles; los de uvicorn conservan su propia config.
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s"
)

# en cloud, sin secretos NO se arranca: mejor un error claro que un panel publico
config.validate_cloud_config()

config.ensure_dirs()
Base.metadata.create_all(engine)
ensure_columns()

with SessionLocal() as db:
    run_manifest_import(db)
    if not db.query(Category).first():
        for name, icon in DEFAULT_CATEGORIES:
            db.add(Category(name=name, icon=icon, is_default=1))
        db.commit()
    fx.ensure_base(db)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # sanity log de arranque (sin secretos): confirma modo, datos y zona horaria
    import time

    logging.getLogger("homeos").info(
        "HomeOS %s arrancó en modo %s | data=%s | tz=%s",
        config.VERSION, config.HOMEOS_ENV, config.DATA_DIR, time.strftime("%Z %z"),
    )
    # UN solo task del scheduler por proceso; con uvicorn en 1 worker (como
    # exige el deployment) eso significa UNA sola instancia en total
    task = asyncio.create_task(reminder_loop())
    yield
    task.cancel()


app = FastAPI(title="HomeOS", version=config.VERSION, lifespan=lifespan)

# la autenticacion solo existe en cloud; en local HomeOS queda abierto en la
# LAN/Tailnet como siempre (HOMEOS_ENV es el unico selector de modo)
if config.IS_CLOUD:
    app.add_middleware(auth.AuthMiddleware)

app.include_router(auth.router)
app.include_router(agents.router)        # usuario (cookie en cloud)
app.include_router(agent_bridge.router)  # maquina-a-maquina (token de agente)
app.include_router(apps.router)
app.include_router(contexts.router)
app.include_router(todos.router)
app.include_router(events.router)
app.include_router(calendar_agenda.router)
app.include_router(google.router)
app.include_router(finance.router)
app.include_router(business.router)
app.include_router(routines.router)
app.include_router(notes.router)
app.include_router(files.router)
app.include_router(settings.router)
app.include_router(uploads.router)
app.include_router(system.router)

class UploadsEstaticos(StaticFiles):
    """/uploads con cache HTTP correcto y PRIVADO.

    - `private`: los uploads son contenido AUTENTICADO (comprobantes, fotos
      personales); solo el navegador del usuario puede guardarlos, jamás un
      cache compartido/proxy.
    - `immutable` para icons/banners/files: sus nombres son UUID únicos, el
      contenido de una URL dada no cambia nunca — un año de cache es seguro.
    - thumbs/ se regeneran bajo el MISMO nombre si el original cambia, así
      que llevan cache corto (7 días) sin immutable.
    """

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.status_code in (200, 304):
            if path.replace("\\", "/").startswith("thumbs/"):
                response.headers["Cache-Control"] = "private, max-age=604800"
            else:
                response.headers["Cache-Control"] = "private, max-age=31536000, immutable"
        return response


app.mount("/uploads", UploadsEstaticos(directory=config.UPLOADS_DIR), name="uploads")

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
