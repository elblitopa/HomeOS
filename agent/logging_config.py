"""Logging local del Agent: archivo con rotación + consola, con redacción.

Regla dura: el token JAMÁS se loguea. Ningún formato de este módulo incluye
headers ni config completa, y además un filtro redacta los secretos si algún
mensaje (por ejemplo, el texto de una excepción de red con la URL y headers)
los trajera por accidente.
"""

import logging
from logging.handlers import RotatingFileHandler

from agent.config import LOGS_DIR

LOG_FILE = LOGS_DIR / "homeos-agent.log"


class RedactSecrets(logging.Filter):
    """Sustituye cada secreto conocido por *** en el mensaje ya formateado."""

    def __init__(self, secretos: list[str]):
        super().__init__()
        # solo valores con tamaño real: redactar "" rompería todo el texto
        self._secretos = [s for s in secretos if s and len(s) >= 8]

    def filter(self, record: logging.LogRecord) -> bool:
        texto = record.getMessage()
        for secreto in self._secretos:
            if secreto in texto:
                texto = texto.replace(secreto, "***")
        record.msg = texto
        record.args = None
        return True


def setup_logging(secretos: list[str], nivel: int = logging.INFO) -> logging.Logger:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("homeos-agent")
    logger.setLevel(nivel)
    logger.handlers.clear()

    formato = logging.Formatter(
        "%(asctime)s %(levelname)-7s %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )
    filtro = RedactSecrets(secretos)

    archivo = RotatingFileHandler(
        LOG_FILE, maxBytes=1_000_000, backupCount=5, encoding="utf-8"
    )
    archivo.setFormatter(formato)
    archivo.addFilter(filtro)
    logger.addHandler(archivo)

    consola = logging.StreamHandler()
    consola.setFormatter(formato)
    consola.addFilter(filtro)
    logger.addHandler(consola)

    return logger
