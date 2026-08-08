"""Configuración de HomeOS.

Todo sale de variables de entorno con defaults que replican el comportamiento
de siempre: SIN ninguna variable definida, HomeOS corre en modo local idéntico
a como corría antes de existir este archivo de configuración por entorno.

HOMEOS_ENV es el ÚNICO selector de modo (no hay otros flags):
  - "local" (default): auth desactivada, SQLite, process_manager de Windows
    directo, HTTP en localhost — el desarrollo y la instalación de siempre.
  - "cloud": auth obligatoria (y el arranque FALLA si faltan los secretos),
    cookie Secure (HTTPS), las apps van por la cola del Windows Agent.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# ---------- entorno ----------

HOMEOS_ENV = os.getenv("HOMEOS_ENV", "local").strip().lower()
if HOMEOS_ENV not in ("local", "cloud"):
    raise RuntimeError(
        f"HOMEOS_ENV inválido: {HOMEOS_ENV!r}. Solo se acepta 'local' o 'cloud'."
    )
IS_CLOUD = HOMEOS_ENV == "cloud"

HOST = "0.0.0.0"
PORT = int(os.getenv("HOMEOS_PORT", "8777"))

# la URL con la que se llega a HomeOS desde afuera; arma el redirect de Google
PUBLIC_URL = os.getenv("HOMEOS_PUBLIC_URL", f"http://localhost:{PORT}").rstrip("/")

# ---------- rutas ----------

DATA_DIR = Path(os.getenv("HOMEOS_DATA_DIR", str(BASE_DIR / "data")))
UPLOADS_DIR = DATA_DIR / "uploads"
ICONS_DIR = UPLOADS_DIR / "icons"
BANNERS_DIR = UPLOADS_DIR / "banners"
FILES_DIR = UPLOADS_DIR / "files"
# miniaturas generadas al vuelo; se pueden borrar, se regeneran solas
THUMBS_DIR = UPLOADS_DIR / "thumbs"
APPS_MANIFEST_DIR = BASE_DIR / "Apps"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"

DB_PATH = DATA_DIR / "homeos.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")

# ---------- secretos (solo obligatorios en cloud) ----------

ACCESS_KEY = os.getenv("HOMEOS_ACCESS_KEY", "")
SESSION_SECRET = os.getenv("HOMEOS_SESSION_SECRET", "")

VERSION = "1.0.0"


def validate_cloud_config() -> None:
    """En cloud, negarse a arrancar antes que quedar expuesto por accidente."""
    if not IS_CLOUD:
        return
    faltan = []
    if not ACCESS_KEY:
        faltan.append("HOMEOS_ACCESS_KEY")
    if not SESSION_SECRET:
        faltan.append("HOMEOS_SESSION_SECRET")
    if faltan:
        raise RuntimeError(
            "HOMEOS_ENV=cloud exige definir: " + ", ".join(faltan)
            + ". Sin autenticación configurada el panel quedaría público."
        )
    if len(SESSION_SECRET) < 32:
        raise RuntimeError(
            "HOMEOS_SESSION_SECRET debe tener al menos 32 caracteres "
            "(genera uno con: python -c \"import secrets; print(secrets.token_urlsafe(48))\")."
        )


def ensure_dirs() -> None:
    for d in (DATA_DIR, ICONS_DIR, BANNERS_DIR, FILES_DIR, THUMBS_DIR, APPS_MANIFEST_DIR):
        d.mkdir(parents=True, exist_ok=True)
