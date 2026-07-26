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
# Google solo acepta http:// en localhost, por eso la conexion se hace desde la PC.
REDIRECT_URI = "http://localhost:8777/api/google/callback"

CLIENT_ID_KEY = "google_client_id"
CLIENT_SECRET_KEY = "google_client_secret"
TOKEN_KEY = "google_token"
CALENDAR_KEY = "google_calendar_id"


class GoogleError(Exception):
    pass


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


def disconnect(db: Session) -> None:
    set_setting(db, TOKEN_KEY, None)


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
            raise GoogleError("Google rechazó la sesión. Vuelve a conectar la cuenta.")
        raise GoogleError(f"Google respondió {e.code}: {detalle}")


# ---------- flujo OAuth ----------

def auth_url(db: Session) -> str:
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

    vence = datetime.fromisoformat(token.get("expires_at", "1970-01-01T00:00:00+00:00"))
    if token.get("access_token") and vence - timedelta(seconds=60) > datetime.now(timezone.utc):
        return token["access_token"]

    client_id, secret = credentials(db)
    data = _post_form(TOKEN_URL, {
        "client_id": client_id,
        "client_secret": secret,
        "refresh_token": token["refresh_token"],
        "grant_type": "refresh_token",
    })
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


def list_events(db: Session, desde: datetime, hasta: datetime) -> list[dict]:
    data = _api(db, "GET", f"/calendars/{urllib.parse.quote(calendar_id(db))}/events", params={
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
        })
    return eventos


def create_event(db: Session, title: str, start: datetime, end: datetime | None,
                 all_day: bool, description: str | None) -> dict:
    cuerpo = {
        "summary": title,
        "description": description,
        "start": _a_google(start, all_day),
        "end": _a_google(end or start + timedelta(hours=1), all_day),
    }
    return _api(db, "POST", f"/calendars/{urllib.parse.quote(calendar_id(db))}/events", cuerpo)


def update_event(db: Session, event_id: str, title: str, start: datetime,
                 end: datetime | None, all_day: bool, description: str | None) -> dict:
    cuerpo = {
        "summary": title,
        "description": description,
        "start": _a_google(start, all_day),
        "end": _a_google(end or start + timedelta(hours=1), all_day),
    }
    path = f"/calendars/{urllib.parse.quote(calendar_id(db))}/events/{urllib.parse.quote(event_id)}"
    return _api(db, "PATCH", path, cuerpo)


def delete_event(db: Session, event_id: str) -> None:
    path = f"/calendars/{urllib.parse.quote(calendar_id(db))}/events/{urllib.parse.quote(event_id)}"
    _api(db, "DELETE", path)
