"""Configuración del Agent: SU PROPIO agent/.env, separado del backend.

El token NUNCA se mete a os.environ: los procesos hijos (las apps lanzadas con
Popen) heredan el environment del agente, y el token no tiene por qué viajar
a ninguna app. La config vive en un objeto y se pasa a quien la necesita.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parent

# HOMEOS_AGENT_HOME relocaliza .env, data/ y logs/ (lo usan las pruebas para
# no tocar el estado real del agente; en producción no se define y todo vive
# dentro de agent/ como siempre)
_HOME = Path(os.environ.get("HOMEOS_AGENT_HOME") or AGENT_DIR)
ENV_PATH = _HOME / ".env"
DATA_DIR = _HOME / "data"
LOGS_DIR = _HOME / "logs"

# la DB local de HomeOS SOLO se lee (y solo en `python -m agent propose`)
# para armar la propuesta inicial de allowlist; el agente jamás escribe ahí
DEFAULT_LOCAL_DB = AGENT_DIR.parent / "data" / "homeos.db"

HEARTBEAT_INTERVAL_S = 15
POLL_WAIT_S = 25
# backoff de reconexión: crece hasta 30s y ahí se queda
BACKOFF_STEPS_S = (1, 2, 5, 10, 30)


class ConfigError(Exception):
    """Config faltante o inválida. Su mensaje es seguro: nunca lleva valores."""


def _parse_env_file(path: Path) -> dict[str, str]:
    """Lector mínimo de .env: KEY=VALOR, comentarios con #, comillas opcionales.

    No se usa python-dotenv para no cargar dependencias ni tocar os.environ.
    """
    valores: dict[str, str] = {}
    if not path.is_file():
        return valores
    for linea in path.read_text(encoding="utf-8-sig").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        valor = valor.strip()
        if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in "\"'":
            valor = valor[1:-1]
        valores[clave.strip()] = valor
    return valores


@dataclass
class AgentConfig:
    server_url: str
    token: str
    device_id: str
    name: str = ""
    browse_roots: list[str] = field(default_factory=list)
    local_db: Path = DEFAULT_LOCAL_DB

    @property
    def secrets(self) -> list[str]:
        """Lo que el logging debe redactar si aparece por accidente."""
        return [self.token] if self.token else []


def load_config() -> AgentConfig:
    """Lee agent/.env (el environment real tiene prioridad) y valida.

    Si falta algo, truena con un mensaje claro que NUNCA imprime valores.
    """
    archivo = _parse_env_file(ENV_PATH)

    def get(clave: str) -> str:
        return (os.environ.get(clave) or archivo.get(clave) or "").strip()

    server_url = get("HOMEOS_SERVER_URL").rstrip("/")
    token = get("HOMEOS_AGENT_TOKEN")
    device_id = get("HOMEOS_DEVICE_ID")

    faltan = [
        nombre
        for nombre, valor in (
            ("HOMEOS_SERVER_URL", server_url),
            ("HOMEOS_AGENT_TOKEN", token),
            ("HOMEOS_DEVICE_ID", device_id),
        )
        if not valor
    ]
    if faltan:
        raise ConfigError(
            "Falta configuración en agent/.env: " + ", ".join(faltan)
            + ". Copia agent/.env.example a agent/.env y llena esos valores. "
            "El token se genera en HomeOS -> Ajustes -> PC Principal."
        )

    if not server_url.startswith(("http://", "https://")):
        raise ConfigError("HOMEOS_SERVER_URL debe empezar con http:// o https://")
    if len(token) < 20:
        raise ConfigError(
            "HOMEOS_AGENT_TOKEN se ve incompleto (muy corto). "
            "Regenera el token en HomeOS -> Ajustes -> PC Principal."
        )

    # varios roots separados por ; (en Windows las rutas llevan ':', así que
    # el separador de PATH de toda la vida es lo natural)
    roots: list[str] = []
    for pedazo in get("HOMEOS_ALLOWED_BROWSE_ROOTS").split(";"):
        pedazo = pedazo.strip().strip('"')
        if not pedazo:
            continue
        real = os.path.realpath(pedazo)
        if os.path.isdir(real):
            roots.append(real)

    local_db = get("HOMEOS_LOCAL_DB")

    return AgentConfig(
        server_url=server_url,
        token=token,
        device_id=device_id,
        name=get("HOMEOS_AGENT_NAME"),
        browse_roots=roots,
        local_db=Path(local_db) if local_db else DEFAULT_LOCAL_DB,
    )
