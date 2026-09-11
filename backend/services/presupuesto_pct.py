"""Distribución de ingresos por porcentaje: el cerebro de los objetivos.

Todo se deriva de datos reales en el momento de pedirlo — nada de esto se
persiste, así que editar una transacción, cambiar una categoría de objetivo o
mover un porcentaje recalcula el estado completo sin sincronizar nada.

Reglas:
- Solo cuentan ingresos y egresos reales; las transferencias entre cuentas
  propias jamás inflan la base ni el gasto.
- Todo en MXN con el tipo de cambio congelado de cada transacción (fx_rate),
  la misma aritmética que usa el resumen mensual.
- Anual = acumulado real del año (total destinado / total ingresos), NUNCA el
  promedio de porcentajes mensuales, que distorsiona.
- kind max: no pasarse. kind min: llegar al menos. Los umbrales de alerta de
  los máximos viven en THRESHOLDS, centralizados (configurables a futuro).
"""

from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models import (
    Account,
    BASE_CURRENCY,
    BudgetBucket,
    BudgetBucketCategory,
    ExchangeRate,
    PERIOD_MONTHS,
    RecurringPayment,
    Transaction,
)

# umbrales de aviso para objetivos de tipo MAXIMO (fracción del límite)
THRESHOLDS = (0.75, 0.90, 1.0)


def _rango(periodo: str, ahora: datetime | None = None) -> tuple[datetime, datetime, str]:
    now = ahora or datetime.now()
    hoy = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if periodo == "anual":
        ini = hoy.replace(month=1, day=1)
        return ini, ini.replace(year=ini.year + 1), f"{ini.year}"
    ini = hoy.replace(day=1)
    fin = (ini + timedelta(days=32)).replace(day=1)
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
             "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    return ini, fin, f"{meses[ini.month - 1]} {ini.year}"


def _mxn(col):
    return func.sum(Transaction.amount * func.coalesce(Transaction.fx_rate, 1.0))


def _ingreso_real(db: Session, ini: datetime, fin: datetime) -> float:
    total = (
        db.query(_mxn(Transaction))
        .filter(
            Transaction.type == "ingreso",
            Transaction.occurred_at >= ini,
            Transaction.occurred_at < fin,
        )
        .scalar()
    )
    return round(total or 0.0, 2)


def _ingreso_esperado(db: Session, periodo: str) -> float:
    """Lo presupuestado: expected_income de las cuentas + cobros recurrentes
    de tipo ingreso (misma definición que el Presupuesto clásico). Anual =
    mensual × 12 — aproximación documentada, no promete estacionalidad."""
    rates = {r.code: r.rate_to_mxn for r in db.query(ExchangeRate).all()}
    mensual = sum(
        (a.expected_income or 0.0) * (rates.get(a.currency, 1.0) or 1.0)
        for a in db.query(Account).all()
    )
    for r in db.query(RecurringPayment).filter(RecurringPayment.type == "ingreso").all():
        if r.account_id and r.installments_paid < r.installments_total:
            meses = PERIOD_MONTHS.get(r.frequency, 1)
            mensual += (r.installment_amount * (rates.get(r.currency or BASE_CURRENCY, 1.0) or 1.0)) / meses
    if periodo == "anual":
        mensual *= 12
    return round(mensual, 2)


def _estado_max(frac: float) -> str:
    if frac > 1.0:
        return "excedido"
    if frac >= 1.0:
        return "al_limite"
    if frac >= THRESHOLDS[1]:
        return "cerca"
    if frac >= THRESHOLDS[0]:
        return "aviso"
    return "ok"


def _estado_min(frac: float) -> str:
    if frac >= 1.0:
        return "cumplido"
    if frac >= THRESHOLDS[0]:
        return "cerca"
    return "debajo"


def _fmt(v: float) -> str:
    return f"${v:,.2f}"


def resumen_buckets(db: Session, periodo: str = "mensual") -> dict:
    """El estado de todos los objetivos en el periodo pedido."""
    if periodo not in ("mensual", "anual"):
        periodo = "mensual"
    ini, fin, etiqueta = _rango(periodo)

    ingreso_real = _ingreso_real(db, ini, fin)
    ingreso_esperado = _ingreso_esperado(db, periodo)

    buckets = (
        db.query(BudgetBucket)
        .order_by(BudgetBucket.sort_order, BudgetBucket.created_at)
        .all()
    )
    enlaces = db.query(BudgetBucketCategory).all()
    cats_de: dict[int, list[int]] = {}
    for e in enlaces:
        cats_de.setdefault(e.bucket_id, []).append(e.category_id)

    # gasto por categoría del periodo, una sola consulta (solo egresos: las
    # transferencias no son gasto y los ingresos no restan)
    gasto_por_cat = dict(
        db.query(Transaction.category_id, _mxn(Transaction))
        .filter(
            Transaction.type == "egreso",
            Transaction.occurred_at >= ini,
            Transaction.occurred_at < fin,
            Transaction.category_id.isnot(None),
        )
        .group_by(Transaction.category_id)
        .all()
    )

    out = []
    for b in buckets:
        base_monto = ingreso_real if b.base == "real" else ingreso_esperado
        objetivo = round(base_monto * b.percent / 100.0, 2)
        gastado = round(sum(gasto_por_cat.get(c, 0.0) or 0.0 for c in cats_de.get(b.id, [])), 2)
        frac_ingreso = (gastado / base_monto) if base_monto > 0 else None
        frac_objetivo = (gastado / objetivo) if objetivo > 0 else None

        if frac_objetivo is None:
            estado, mensaje = "sin_base", "Sin ingresos en el periodo: no hay contra qué medir."
        elif b.kind == "max":
            estado = _estado_max(frac_objetivo)
            restante = round(objetivo - gastado, 2)
            if estado == "excedido":
                mensaje = f"Excediste tu presupuesto de {b.name} en {_fmt(-restante)}."
            elif estado == "al_limite":
                mensaje = f"Alcanzaste tu límite de {b.name} del periodo."
            elif estado == "cerca":
                mensaje = f"Estás cerca de tu límite de {b.name}. Te quedan {_fmt(restante)}."
            elif estado == "aviso":
                mensaje = f"Has utilizado {round(frac_objetivo * 100)}% de tu presupuesto de {b.name}."
            else:
                mensaje = f"Te quedan {_fmt(restante)} disponibles en {b.name}."
        else:
            estado = _estado_min(frac_objetivo)
            faltante = round(objetivo - gastado, 2)
            if estado == "cumplido":
                mensaje = f"Objetivo de {b.name} cumplido: {round(frac_objetivo * 100)}% de la meta."
            elif estado == "cerca":
                mensaje = f"Has alcanzado {round(frac_objetivo * 100)}% de tu meta de {b.name}."
            else:
                mensaje = f"Faltan {_fmt(faltante)} para alcanzar tu objetivo de {b.name}."

        out.append({
            **b.to_dict(),
            "category_ids": cats_de.get(b.id, []),
            "base_amount": base_monto,
            "target_amount": objetivo,
            "spent_amount": gastado,
            # % de los ingresos que representa lo gastado (lo que pide la UI)
            "spent_pct_of_income": round(frac_ingreso * 100, 1) if frac_ingreso is not None else None,
            "progress": round(min(frac_objetivo, 2.0), 4) if frac_objetivo is not None else None,
            "remaining": round(objetivo - gastado, 2),
            "estado": estado,
            "mensaje": mensaje,
        })

    return {
        "period": periodo,
        "label": etiqueta,
        "from": ini.isoformat(),
        "to": fin.isoformat(),
        "income_real": ingreso_real,
        "income_esperado": ingreso_esperado,
        "thresholds": list(THRESHOLDS),
        "buckets": out,
    }
