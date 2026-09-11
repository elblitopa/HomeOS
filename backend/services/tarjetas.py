"""Fechas de tarjetas de credito: corte y limite de pago.

El usuario guarda DIAS del mes (statement_day / payment_day), nunca fechas
fijas. Aqui se derivan las fechas concretas, con dos reglas importantes:

- Si el dia no existe en un mes (31 en febrero), se usa el ultimo dia del mes.
- El pago pertenece al corte anterior: con corte 15 y pago 5, el corte del 15
  de septiembre se paga el 5 de OCTUBRE. Nunca se asume que corte y pago caen
  en el mismo mes.

Todo se calcula al vuelo: no se persiste ninguna fecha, asi que cambiar el
dia de corte mueve solo todos los eventos futuros (el espejo de Google los
actualiza por fingerprint y el calendario los expande virtualmente).
"""

import calendar
from datetime import date, timedelta

from backend.models import Account

# offsets de recordatorio para corte y pago, en dias antes (centralizados;
# los usa el scheduler de Discord). Configurables a futuro via Ajustes.
AVISOS_DIAS = (7, 3, 1, 0)


def fecha_en_mes(year: int, month: int, day: int) -> date:
    """El dia pedido dentro de ese mes, ajustado al ultimo dia si no existe."""
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _mes_siguiente(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def _mes_anterior(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def proxima_ocurrencia(day: int, base: date) -> date:
    """La primera ocurrencia del dia (ajustada a fin de mes) >= base."""
    candidata = fecha_en_mes(base.year, base.month, day)
    if candidata >= base:
        return candidata
    y, m = _mes_siguiente(base.year, base.month)
    return fecha_en_mes(y, m, day)


def ocurrencia_despues(day: int, base: date) -> date:
    """La primera ocurrencia ESTRICTAMENTE despues de base."""
    return proxima_ocurrencia(day, base + timedelta(days=1))


def es_tarjeta(acc: Account) -> bool:
    """Con dias configurados hay fechas que calcular; sin ellos, la tarjeta
    se comporta como cualquier cuenta (compatibilidad con datos previos)."""
    return acc.kind == "credito" and bool(acc.statement_day or acc.payment_day)


def fechas_tarjeta(acc: Account, hoy: date | None = None) -> dict | None:
    """Proximo corte y proximo pago de una tarjeta, con sus dias restantes.

    El pago que se muestra es el VIGENTE: el del corte anterior si aun no
    pasa, o el del corte que viene si aquel ya se pago. Sin dia de corte, el
    pago es simplemente su siguiente ocurrencia mensual.
    """
    if not es_tarjeta(acc):
        return None
    hoy = hoy or date.today()

    corte = proxima_ocurrencia(acc.statement_day, hoy) if acc.statement_day else None

    pago = None
    if acc.payment_day:
        if acc.statement_day:
            # ultimo corte que ya ocurrio (estrictamente antes de hoy)
            y, m = (hoy.year, hoy.month)
            ultimo = fecha_en_mes(y, m, acc.statement_day)
            if ultimo >= hoy:
                y, m = _mes_anterior(y, m)
                ultimo = fecha_en_mes(y, m, acc.statement_day)
            pago = ocurrencia_despues(acc.payment_day, ultimo)
            if pago < hoy:
                # ese pago ya paso: el vigente es el del corte que viene
                pago = ocurrencia_despues(acc.payment_day, corte)
        else:
            pago = proxima_ocurrencia(acc.payment_day, hoy)

    return {
        "statement_date": corte.isoformat() if corte else None,
        "statement_days_left": (corte - hoy).days if corte else None,
        "payment_date": pago.isoformat() if pago else None,
        "payment_days_left": (pago - hoy).days if pago else None,
    }


def ocurrencias_en_rango(day: int, desde: date, hasta: date, limit: int = 40) -> list[date]:
    """Ocurrencias mensuales del dia (ajustado a fin de mes) en [desde, hasta)."""
    out: list[date] = []
    y, m = desde.year, desde.month
    while len(out) < limit:
        candidata = fecha_en_mes(y, m, day)
        if candidata >= hasta:
            break
        if candidata >= desde:
            out.append(candidata)
        y, m = _mes_siguiente(y, m)
    return out
