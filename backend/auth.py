"""Autenticación de HomeOS: clave única + cookie de sesión firmada.

Solo existe en modo cloud (HOMEOS_ENV=cloud). En local no se instala el
middleware y nada de esto interviene: HomeOS queda abierto en la LAN/Tailnet
como siempre.

Diseño:
- El usuario teclea HOMEOS_ACCESS_KEY en el login (un solo usuario).
- La sesión es una cookie HttpOnly firmada con HMAC-SHA256 usando
  HOMEOS_SESSION_SECRET (independiente de la clave: rotarlo desloguea todos
  los dispositivos sin cambiar la clave). Sin tabla de sesiones: sobrevive
  reinicios y deploys.
- Cookie y no header porque los <img src="/uploads/..."> y los <a href> de
  descargas no pueden mandar headers; la cookie viaja sola en mismo origen.
"""

import hashlib
import hmac
import secrets
import time

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from backend import config

COOKIE_NAME = "homeos_session"
SESSION_DAYS = 90  # larga porque la PWA de iOS no debe pedir login seguido

# rutas que NO exigen cookie (mínimas y explícitas):
# - login: es la puerta
# - system/ping: health check / latencia, no revela nada
# - google/callback: llega redirigido desde Google; valida su propio state
# - agent-bridge: máquina-a-máquina, autentica con el token del agente (F2)
EXCLUDED_PREFIXES = (
    "/api/auth/login",
    "/api/system/ping",
    "/api/google/callback",
    "/api/agent-bridge/",
)

# ---------- firma de tokens (sesión y state de OAuth) ----------

# En cloud el secreto viene del env (obligatorio). En local no hay sesiones,
# pero el state de OAuth también se firma: se usa un secreto efímero por
# proceso — el flujo de Google inicia y termina en el mismo proceso.
_SECRET = (config.SESSION_SECRET or secrets.token_urlsafe(32)).encode()


def _firmar(payload: str) -> str:
    mac = hmac.new(_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{mac}"


def _verificar(token: str) -> str | None:
    """Devuelve el payload si la firma es válida y no expiró; si no, None."""
    payload, _, mac = token.rpartition(".")
    if not payload:
        return None
    esperado = hmac.new(_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(mac, esperado):
        return None
    return payload


def crear_sesion() -> str:
    exp = int(time.time()) + SESSION_DAYS * 86400
    return _firmar(f"s.{exp}")


def sesion_valida(token: str | None) -> bool:
    if not token:
        return False
    payload = _verificar(token)
    if not payload or not payload.startswith("s."):
        return False
    try:
        return int(payload.split(".", 1)[1]) > time.time()
    except ValueError:
        return False


def crear_state_oauth() -> str:
    """State de un solo uso lógico para el flujo de Google: firmado y con
    expiración corta. (Un state ya usado dentro de la ventana no da acceso a
    nada: el callback solo canjea el code de Google que viaja junto a él.)"""
    exp = int(time.time()) + 600  # 10 minutos para completar el flujo
    return _firmar(f"g.{exp}.{secrets.token_urlsafe(16)}")


def state_oauth_valido(state: str | None) -> bool:
    if not state:
        return False
    payload = _verificar(state)
    if not payload or not payload.startswith("g."):
        return False
    try:
        return int(payload.split(".")[1]) > time.time()
    except (ValueError, IndexError):
        return False


# ---------- rate limit del login (en memoria; un solo proceso) ----------

_intentos: dict[str, list[float]] = {}
MAX_INTENTOS = 5
VENTANA_S = 60


def _permitido(ip: str) -> bool:
    ahora = time.time()
    marcas = [t for t in _intentos.get(ip, []) if ahora - t < VENTANA_S]
    _intentos[ip] = marcas
    return len(marcas) < MAX_INTENTOS


def _registrar_intento(ip: str) -> None:
    _intentos.setdefault(ip, []).append(time.time())


# ---------- middleware ----------


class AuthMiddleware(BaseHTTPMiddleware):
    """Exige cookie de sesión en /api/* y /uploads/*.

    El SPA (/, /assets, manifest, iconos) queda libre: sin él no se podría
    pintar la pantalla de login.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        protegido = path.startswith("/api/") or path.startswith("/uploads/")
        if protegido and not any(path.startswith(p) for p in EXCLUDED_PREFIXES):
            if not sesion_valida(request.cookies.get(COOKIE_NAME)):
                return JSONResponse({"detail": "No autenticado"}, status_code=401)
        return await call_next(request)


# ---------- endpoints ----------

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginPayload(BaseModel):
    key: str


def _poner_cookie(response: Response) -> None:
    response.set_cookie(
        COOKIE_NAME,
        crear_sesion(),
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
        # Secure solo en cloud: en local el desarrollo va por http://localhost
        secure=config.IS_CLOUD,
    )


@router.post("/login")
def login(payload: LoginPayload, request: Request, response: Response):
    ip = request.client.host if request.client else "?"
    if not _permitido(ip):
        raise HTTPException(429, "Demasiados intentos. Espera un minuto.")
    # compare_digest: tiempo constante, no filtra por dónde falló la clave
    if not config.ACCESS_KEY or not secrets.compare_digest(
        payload.key, config.ACCESS_KEY
    ):
        _registrar_intento(ip)
        raise HTTPException(401, "Clave incorrecta")
    _poner_cookie(response)
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/me")
def me(request: Request):
    """200 si hay sesión (o si la auth está apagada, en local); 401 si no.

    El frontend lo usa para decidir si muestra la pantalla de login.
    """
    if not config.IS_CLOUD:
        return {"ok": True, "mode": "local"}
    if sesion_valida(request.cookies.get(COOKIE_NAME)):
        return {"ok": True, "mode": "cloud"}
    raise HTTPException(401, "No autenticado")
