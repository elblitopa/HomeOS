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
# precios de cripto directo en MXN, tampoco piden credenciales
CRYPTO_SOURCE = "https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=mxn"
CRYPTO_FALLBACK = "https://api.coinbase.com/v2/exchange-rates?currency={code}"
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


def fetch_crypto_to_mxn(coins: dict[str, str]) -> dict[str, float]:
    """coins = {'BTC': 'bitcoin', …} -> {'BTC': 1127347.0}"""
    if not coins:
        return {}
    prices: dict[str, float] = {}

    ids = ",".join(sorted({v for v in coins.values() if v}))
    if ids:
        try:
            data = _get_json(CRYPTO_SOURCE.format(ids=ids))
            for code, api_id in coins.items():
                value = (data.get(api_id) or {}).get("mxn")
                if value:
                    prices[code] = float(value)
        except Exception as e:
            log.warning("CoinGecko no disponible: %s", e)

    # respaldo moneda por moneda para las que hayan quedado sin precio
    for code in coins:
        if code in prices:
            continue
        try:
            data = _get_json(CRYPTO_FALLBACK.format(code=code))
            value = ((data.get("data") or {}).get("rates") or {}).get("MXN")
            if value:
                prices[code] = float(value)
        except Exception as e:
            log.warning("Sin precio para %s: %s", code, e)

    return prices


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

    fiat = [r for r in auto if (r.kind or "fiat") != "cripto"]
    crypto = [r for r in auto if (r.kind or "fiat") == "cripto"]

    table: dict[str, float] = {}
    if fiat:
        table.update(fetch_rates_to_mxn())
    if crypto:
        table.update(
            fetch_crypto_to_mxn({r.code: r.api_id or r.code.lower() for r in crypto})
        )
    if not table:
        return {"updated": 0, "skipped": "sin conexion"}

    updated = 0
    for row in auto:
        value = table.get(row.code)
        if value:
            # las cripto valen millones o fracciones de centavo: mas decimales
            row.rate_to_mxn = round(value, 2 if value > 1000 else 10)
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
