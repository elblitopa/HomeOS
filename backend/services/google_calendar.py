"""Google Calendar sin librerias externas.

OAuth 2.0 y la API REST se hablan con urllib, igual que el resto del proyecto
(Discord, tipos de cambio). Las credenciales y el token viven en la tabla de
ajustes; el token se refresca solo cuando esta por vencer.
"""

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from backend.models import get_setting, set_setting

log = logging.getLogger("homeos.google")

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/calendar/v3"
SCOPE = "https://www.googleapis.com/auth/calendar"
TIMEOUT = 20

# El callback tiene que coincidir con el registrado en Google Cloud Console.
# Sale de HOMEOS_PUBLIC_URL: en local es http://localhost:8777 (Google acepta
# http solo en localhost); en cloud sera el dominio HTTPS (ej. ts.net), que hay
# que registrar en la consola de Google al desplegar.
from backend.config import PUBLIC_URL

REDIRECT_URI = f"{PUBLIC_URL}/api/google/callback"

CLIENT_ID_KEY = "google_client_id"
CLIENT_SECRET_KEY = "google_client_secret"
TOKEN_KEY = "google_token"
CALENDAR_KEY = "google_calendar_id"        # donde se guardan los eventos nuevos
VISIBLE_KEY = "google_visible_calendars"   # cuales se muestran en el calendario
# estado del refresh token: None/"ok" mientras sirve; "requires_reconnect"
# cuando Google lo rechazo con invalid_grant (caduca a los 7 dias porque el
# OAuth del proyecto esta en modo Testing — decision deliberada de Pablo).
# Con el flag puesto NADIE vuelve a intentar refresh hasta reconectar.
TOKEN_STATUS_KEY = "google_token_status"
REQUIERE_RECONEXION = "requires_reconnect"


# marca que HomeOS deja en los eventos que el mismo crea, para reconocerlos
# despues (y no volver a pintarlos como si fueran eventos ajenos de Google)
MARK_KEY = "homeos"


class GoogleError(Exception):
    def __init__(self, mensaje: str, status: int | None = None):
        super().__init__(mensaje)
        self.status = status


# ---------- credenciales ----------

def credentials(db: Session) -> tuple[str | None, str | None]:
    return get_setting(db, CLIENT_ID_KEY), get_setting(db, CLIENT_SECRET_KEY)


def _token(db: Session) -> dict:
    raw = get_setting(db, TOKEN_KEY)
    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {}


def is_connected(db: Session) -> bool:
    return bool(_token(db).get("refresh_token"))


def estado(db: Session) -> str:
    """Estado REAL de la conexión, no solo "hay un token guardado".

    - "no_conectado":         sin refresh_token en la base.
    - "requiere_reconexion":  hay token pero Google ya lo rechazó
                              (invalid_grant); reconectar es lo único útil.
    - "conectado":            token presente y sin rechazo registrado.
    """
    if not is_connected(db):
        return "no_conectado"
    if get_setting(db, TOKEN_STATUS_KEY) == REQUIERE_RECONEXION:
        return "requiere_reconexion"
    return "conectado"


def _marcar_reconexion(db: Session) -> None:
    """Persiste el rechazo UNA vez (y avisa una sola vez en el log).

    Se conserva todo lo demás: token viejo, google_links, mappings de
    calendarios y eventos. Nada se borra; reconectar lo reactiva todo.
    """
    if get_setting(db, TOKEN_STATUS_KEY) != REQUIERE_RECONEXION:
        set_setting(db, TOKEN_STATUS_KEY, REQUIERE_RECONEXION)
        log.warning(
            "Google rechazó el refresh token (invalid_grant). El sync queda "
            "suspendido hasta reconectar la cuenta desde Ajustes."
        )


def disconnect(db: Session) -> None:
    set_setting(db, TOKEN_KEY, None)
    set_setting(db, TOKEN_STATUS_KEY, None)


# ---------- http ----------

def _post_form(url: str, data: dict) -> dict:
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        detalle = e.read().decode(errors="ignore")[:300]
        raise GoogleError(f"Google respondió {e.code}: {detalle}")


def _api(db: Session, method: str, path: str, payload=None, params=None) -> dict:
    token = _access_token(db)
    url = f"{API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detalle = e.read().decode(errors="ignore")[:300]
        if e.code in (401, 403):
            raise GoogleError("Google rechazó la sesión. Vuelve a conectar la cuenta.", e.code)
        raise GoogleError(f"Google respondió {e.code}: {detalle}", e.code)


# ---------- flujo OAuth ----------

def auth_url(db: Session) -> str:
    from backend.auth import crear_state_oauth

    client_id, secret = credentials(db)
    if not client_id or not secret:
        raise GoogleError("Faltan el Client ID y el Client Secret de Google.")
    params = {
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",   # para obtener refresh_token
        "prompt": "consent",        # asegura que siempre mande refresh_token
        "include_granted_scopes": "true",
        # anti-CSRF: el callback exige este state firmado y con expiracion;
        # sin el, cualquiera podria mandarnos un code ajeno al callback
        "state": crear_state_oauth(),
    }
    return f"{AUTH_URL}?{urllib.parse.urlencode(params)}"


def exchange_code(db: Session, code: str) -> None:
    client_id, secret = credentials(db)
    data = _post_form(TOKEN_URL, {
        "code": code,
        "client_id": client_id,
        "client_secret": secret,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    })
    if "refresh_token" not in data:
        raise GoogleError("Google no envió refresh_token. Revoca el acceso y reconecta.")
    _guardar_token(db, data)
    # credenciales frescas: si veniamos de un invalid_grant, aqui se levanta
    # la suspension y el espejo retoma solo en la siguiente vuelta
    set_setting(db, TOKEN_STATUS_KEY, None)


def _guardar_token(db: Session, data: dict, conservar_refresh: str | None = None) -> None:
    expira = datetime.now(timezone.utc) + timedelta(seconds=int(data.get("expires_in", 3600)))
    token = {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token") or conservar_refresh,
        "expires_at": expira.isoformat(),
    }
    set_setting(db, TOKEN_KEY, json.dumps(token))


def _access_token(db: Session) -> str:
    token = _token(db)
    if not token.get("refresh_token"):
        raise GoogleError("No hay ninguna cuenta de Google conectada.")

    # corte central: con el refresh token ya rechazado, ningún caminante
    # (sync, calendario, status) vuelve a golpear a Google hasta reconectar
    if get_setting(db, TOKEN_STATUS_KEY) == REQUIERE_RECONEXION:
        raise GoogleError(
            "La sesión de Google caducó. Reconéctala en Ajustes → Google.", 401
        )

    vence = datetime.fromisoformat(token.get("expires_at", "1970-01-01T00:00:00+00:00"))
    if token.get("access_token") and vence - timedelta(seconds=60) > datetime.now(timezone.utc):
        return token["access_token"]

    client_id, secret = credentials(db)
    try:
        data = _post_form(TOKEN_URL, {
            "client_id": client_id,
            "client_secret": secret,
            "refresh_token": token["refresh_token"],
            "grant_type": "refresh_token",
        })
    except GoogleError as e:
        # invalid_grant = refresh token expirado/revocado (en Testing caduca a
        # los 7 días). Se persiste el estado y se deja de insistir.
        if "invalid_grant" in str(e):
            _marcar_reconexion(db)
            raise GoogleError(
                "La sesión de Google caducó. Reconéctala en Ajustes → Google.", 401
            )
        raise
    _guardar_token(db, data, conservar_refresh=token["refresh_token"])
    return data["access_token"]


# ---------- fechas ----------

def _a_local(valor: dict) -> tuple[datetime, bool]:
    """Convierte el start/end de Google a hora local sin zona."""
    if "date" in valor:  # evento de dia completo
        return datetime.fromisoformat(valor["date"]), True
    crudo = valor["dateTime"].replace("Z", "+00:00")
    dt = datetime.fromisoformat(crudo)
    return dt.astimezone().replace(tzinfo=None), False


def _a_google(dt: datetime, all_day: bool) -> dict:
    if all_day:
        return {"date": dt.strftime("%Y-%m-%d")}
    return {"dateTime": dt.astimezone().isoformat()}


def rango(start: datetime, end: datetime | None, all_day: bool) -> tuple[dict, dict]:
    """start/end tal como los quiere Google.

    En los eventos de dia completo el "end" es exclusivo: un evento de un solo
    dia termina al dia siguiente. Sin esto Google rechaza el evento porque el
    fin no seria mayor que el inicio.
    """
    if all_day:
        ultimo = (end or start).date()
        if ultimo <= start.date():
            ultimo = start.date()
        return (
            {"date": start.strftime("%Y-%m-%d")},
            {"date": (ultimo + timedelta(days=1)).strftime("%Y-%m-%d")},
        )
    return _a_google(start, False), _a_google(end or start + timedelta(hours=1), False)


# ---------- calendarios y eventos ----------

def calendars(db: Session) -> list[dict]:
    data = _api(db, "GET", "/users/me/calendarList", params={"maxResults": 50})
    return [
        {
            "id": c["id"],
            "name": c.get("summary", c["id"]),
            "primary": bool(c.get("primary")),
            "color": c.get("backgroundColor"),
        }
        for c in data.get("items", [])
        if c.get("accessRole") in ("owner", "writer")
    ]


def calendar_id(db: Session) -> str:
    return get_setting(db, CALENDAR_KEY) or "primary"


def visible_calendars(db: Session) -> list[str] | None:
    """Ids de los calendarios que se muestran. None = todos."""
    raw = get_setting(db, VISIBLE_KEY)
    if not raw:
        return None
    try:
        ids = json.loads(raw)
        return ids if isinstance(ids, list) else None
    except json.JSONDecodeError:
        return None


def set_visible_calendars(db: Session, ids: list[str] | None) -> None:
    set_setting(db, VISIBLE_KEY, json.dumps(ids) if ids is not None else None)


def _events_of(db: Session, cal: dict, desde: datetime, hasta: datetime) -> list[dict]:
    data = _api(db, "GET", f"/calendars/{urllib.parse.quote(cal['id'])}/events", params={
        "timeMin": desde.astimezone().isoformat(),
        "timeMax": hasta.astimezone().isoformat(),
        "singleEvents": "true",     # expande los eventos que se repiten
        "orderBy": "startTime",
        "maxResults": 250,
    })
    eventos = []
    for e in data.get("items", []):
        if e.get("status") == "cancelled" or "start" not in e:
            continue
        # los espejos que puso HomeOS ya se pintan desde la base local; si se
        # leyeran tambien de aqui, cada evento apareceria dos veces
        if marca_homeos(e):
            continue
        inicio, all_day = _a_local(e["start"])
        fin = _a_local(e["end"])[0] if e.get("end") else None
        eventos.append({
            "id": e["id"],
            "title": e.get("summary") or "(sin título)",
            "description": e.get("description"),
            "start": inicio,
            "end": fin,
            "all_day": all_day,
            "link": e.get("htmlLink"),
            "calendar_id": cal["id"],
            "calendar_name": cal["name"],
        })
    return eventos


def list_events(db: Session, desde: datetime, hasta: datetime) -> list[dict]:
    """Eventos de todos los calendarios visibles, no solo del principal."""
    elegidos = visible_calendars(db)
    eventos: list[dict] = []
    for cal in calendars(db):
        if elegidos is not None and cal["id"] not in elegidos:
            continue
        try:
            eventos.extend(_events_of(db, cal, desde, hasta))
        except GoogleError as e:
            # un calendario que falle no debe tumbar a los demas
            log.warning("No se pudieron leer los eventos de %s: %s", cal["name"], e)
    eventos.sort(key=lambda e: e["start"])
    return eventos


def create_event(db: Session, title: str, start: datetime, end: datetime | None,
                 all_day: bool, description: str | None) -> dict:
    inicio, fin = rango(start, end, all_day)
    cuerpo = {
        "summary": title,
        "description": description,
        "start": inicio,
        "end": fin,
    }
    return _api(db, "POST", f"/calendars/{urllib.parse.quote(calendar_id(db))}/events", cuerpo)


def update_event(db: Session, event_id: str, title: str, start: datetime,
                 end: datetime | None, all_day: bool, description: str | None,
                 cal_id: str | None = None) -> dict:
    """cal_id es el calendario donde vive el evento, que no tiene por que ser
    el mismo donde se guardan los nuevos."""
    inicio, fin = rango(start, end, all_day)
    cuerpo = {
        "summary": title,
        "description": description,
        "start": inicio,
        "end": fin,
    }
    destino = urllib.parse.quote(cal_id or calendar_id(db))
    return _api(db, "PATCH", f"/calendars/{destino}/events/{urllib.parse.quote(event_id)}", cuerpo)


def delete_event(db: Session, event_id: str, cal_id: str | None = None) -> None:
    destino = urllib.parse.quote(cal_id or calendar_id(db))
    _api(db, "DELETE", f"/calendars/{destino}/events/{urllib.parse.quote(event_id)}")


# ---------- espejo de HomeOS ----------

def marca_homeos(evento: dict) -> str | None:
    """Regresa "tipo:id" si el evento lo creo HomeOS, o None si es ajeno."""
    props = (evento.get("extendedProperties") or {}).get("private") or {}
    return props.get(MARK_KEY)


def insert_raw(db: Session, cal_id: str, cuerpo: dict) -> dict:
    return _api(db, "POST", f"/calendars/{urllib.parse.quote(cal_id)}/events", cuerpo)


def patch_raw(db: Session, cal_id: str, event_id: str, cuerpo: dict) -> dict:
    destino = urllib.parse.quote(cal_id)
    return _api(db, "PATCH", f"/calendars/{destino}/events/{urllib.parse.quote(event_id)}", cuerpo)
