from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

HOST = "0.0.0.0"
PORT = 8777

DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
ICONS_DIR = UPLOADS_DIR / "icons"
BANNERS_DIR = UPLOADS_DIR / "banners"
FILES_DIR = UPLOADS_DIR / "files"
APPS_MANIFEST_DIR = BASE_DIR / "Apps"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"

DB_PATH = DATA_DIR / "homeos.db"

VERSION = "1.0.0"


def ensure_dirs() -> None:
    for d in (DATA_DIR, ICONS_DIR, BANNERS_DIR, FILES_DIR, APPS_MANIFEST_DIR):
        d.mkdir(parents=True, exist_ok=True)
