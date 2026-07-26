"""Tipos de cambio hacia MXN.

Consulta una API publica gratuita (sin registro) una vez al dia y guarda el
resultado en la base. Las divisas marcadas como manuales nunca se sobrescriben,
y si no hay internet se conserva el ultimo valor conocido.
"""

import json
import logging
import urllib.request
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.models import BASE_CURRENCY, ExchangeRate

log = logging.getLogger("homeos.fx")

# ambas devuelven tipos de cambio con base USD y no piden credenciales
SOURCES = (
    "https://open.er-api.com/v6/latest/USD",
    "https://api.frankfurter.app/latest?from=USD",
)
TIMEOUT_S = 15
REFRESH_EVERY = timedelta(hours=12)


def _get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "HomeOS"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_rates_to_mxn() -> dict[str, float]:
    """{'USD': 17.48, 'EUR': 20.1, ...}. Vacio si ninguna fuente responde."""
    for url in SOURCES:
        try:
            data = _get_json(url)
            usd_rates = data.get("rates") or {}
            usd_rates.setdefault("USD", 1.0)
            mxn_per_usd = usd_rates.get(BASE_CURRENCY)
            if not mxn_per_usd:
                continue
            # cruzada: cuantos MXN vale 1 unidad de cada divisa
            return {
                code: mxn_per_usd / value
                for code, value in usd_rates.items()
                if isinstance(value, (int, float)) and value > 0
            }
        except Exception as e:  # red caida, DNS, JSON raro…
            log.warning("Fuente de divisas no disponible (%s): %s", url, e)
    return {}


def refresh_rates(db: Session, force: bool = False) -> dict:
    """Actualiza las divisas automaticas. No toca las manuales."""
    tracked = db.query(ExchangeRate).filter(ExchangeRate.code != BASE_CURRENCY).all()
    auto = [r for r in tracked if not r.manual]
    if not auto:
        return {"updated": 0, "skipped": "sin divisas automaticas"}

    if not force:
        newest = max((r.updated_at for r in auto if r.updated_at), default=None)
        if newest and datetime.now() - newest < REFRESH_EVERY:
            return {"updated": 0, "skipped": "actualizado recientemente"}

    table = fetch_rates_to_mxn()
    if not table:
        return {"updated": 0, "skipped": "sin conexion"}

    updated = 0
    for row in auto:
        value = table.get(row.code)
        if value:
            row.rate_to_mxn = round(value, 6)
            row.updated_at = datetime.now()
            row.source = "auto"
            updated += 1
    if updated:
        db.commit()
        log.info("Divisas actualizadas: %d", updated)
    return {"updated": updated}


def current_rate(db: Session, code: str | None) -> float:
    """Tipo de cambio vigente de `code` a MXN (1.0 si es la divisa base)."""
    if not code or code == BASE_CURRENCY:
        return 1.0
    row = db.get(ExchangeRate, code)
    return row.rate_to_mxn if row and row.rate_to_mxn else 1.0


def ensure_base(db: Session) -> None:
    """La divisa base siempre existe y vale 1."""
    if not db.get(ExchangeRate, BASE_CURRENCY):
        db.add(
            ExchangeRate(code=BASE_CURRENCY, rate_to_mxn=1.0, manual=1, source="base")
        )
        db.commit()
