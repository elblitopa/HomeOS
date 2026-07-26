"""Utilidades de fechas compartidas entre modulos."""

import calendar
from datetime import datetime


def add_months(dt: datetime, months: int) -> datetime:
    """Suma meses respetando el fin de mes (31 de enero + 1 mes = 28/29 de febrero)."""
    month = dt.month - 1 + months
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def occurrences(
    start: datetime,
    months: int,
    since: datetime,
    until: datetime,
    limit: int = 40,
) -> list[datetime]:
    """Fechas de un pago periodico que caen dentro de [since, until).

    `start` es el proximo cobro conocido; se adelanta o se repite tantas veces
    como haga falta para cubrir el rango que se esta viendo en el calendario.
    """
    if months <= 0:
        return []

    cursor = start
    # si el proximo cobro es anterior al rango, avanzar hasta alcanzarlo
    while cursor < since:
        cursor = add_months(cursor, months)
        if cursor.year > until.year + 5:  # red de seguridad
            return []

    out: list[datetime] = []
    while cursor < until and len(out) < limit:
        out.append(cursor)
        cursor = add_months(cursor, months)
    return out
