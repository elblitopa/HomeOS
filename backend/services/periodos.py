"""Rangos de tiempo para las vistas de Finanzas.

Una sola definicion de que significa "hoy", "semana", "mes" o "ano", para que
el detalle de cuenta, los presupuestos y cualquier resumen cuenten exactamente
los mismos dias. Todo en hora LOCAL del servidor (la misma zona que usan los
saldos y el calendario); los rangos son [inicio, fin) como en el resto del
backend.
"""

from datetime import datetime, timedelta

from fastapi import HTTPException

PERIODOS = ("hoy", "semana", "mes", "ano", "todo", "custom")


def rango_periodo(
    periodo: str,
    desde: datetime | None = None,
    hasta: datetime | None = None,
    week_start: str = "monday",
    ahora: datetime | None = None,
) -> tuple[datetime | None, datetime | None]:
    """(inicio, fin) del periodo pedido; (None, None) = sin filtro (todo).

    "custom" usa [desde, hasta]; el tope se vuelve exclusivo sumando un dia
    cuando viene sin hora, porque el usuario elige dias inclusivos.
    """
    if periodo not in PERIODOS:
        raise HTTPException(400, f"Periodo inválido: {periodo}")
    now = ahora or datetime.now()
    hoy = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if periodo == "todo":
        return None, None
    if periodo == "hoy":
        return hoy, hoy + timedelta(days=1)
    if periodo == "semana":
        # el mismo inicio de semana que el calendario (ajuste del usuario)
        dia = hoy.weekday()  # 0 = lunes
        atras = (dia + 1) % 7 if week_start == "sunday" else dia
        inicio = hoy - timedelta(days=atras)
        return inicio, inicio + timedelta(days=7)
    if periodo == "mes":
        inicio = hoy.replace(day=1)
        fin = (inicio + timedelta(days=32)).replace(day=1)
        return inicio, fin
    if periodo == "ano":
        return hoy.replace(month=1, day=1), hoy.replace(year=hoy.year + 1, month=1, day=1)

    # custom
    if not desde or not hasta:
        raise HTTPException(400, "El periodo personalizado necesita from y to")
    fin = hasta
    if (fin.hour, fin.minute, fin.second) == (0, 0, 0):
        fin = fin + timedelta(days=1)  # dias inclusivos para el usuario
    if fin <= desde:
        raise HTTPException(400, "El rango personalizado está volteado")
    return desde, fin
