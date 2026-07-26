"""Agenda unificada: junta en una sola lista todo lo que tiene fecha en HomeOS
(eventos, tareas, suscripciones, deudas, metas, notas y transacciones) para
que el calendario general pueda mostrarlo todo junto.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    BASE_CURRENCY,
    Account,
    Event,
    ExchangeRate,
    Goal,
    Note,
    PERIOD_MONTHS,
    RecurringPayment,
    Subscription,
    Todo,
    Transaction,
)
from backend.services import google_calendar as gcal
from backend.services.dates import occurrences

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

KINDS = [
    "evento", "google", "tarea", "suscripcion", "pago", "meta", "nota", "transaccion",
]


def _money(amount: float, currency: str = BASE_CURRENCY) -> str:
    return f"${amount:,.2f} {currency}"


@router.get("/agenda")
def agenda(
    desde: datetime = Query(alias="from"),
    hasta: datetime = Query(alias="to"),
    kinds: str | None = None,
    db: Session = Depends(get_db),
):
    """Todo lo que cae entre dos fechas, en un formato comun."""
    wanted = set((kinds or ",".join(KINDS)).split(","))
    rates = {r.code: r.rate_to_mxn for r in db.query(ExchangeRate).all()}
    items: list[dict] = []

    def add(kind, ref_id, title, when, detail=None, context_id=None, extra=None):
        items.append({
            "kind": kind,
            "ref_id": ref_id,
            "title": title,
            "date": when.isoformat(),
            "detail": detail,
            "context_id": context_id,
            **(extra or {}),
        })

    if "evento" in wanted:
        for e in db.query(Event).filter(Event.start >= desde, Event.start < hasta):
            add("evento", e.id, e.title, e.start, e.description, e.context_id,
                {"all_day": e.all_day, "end": e.end.isoformat() if e.end else None})

    if "google" in wanted and gcal.is_connected(db):
        try:
            for e in gcal.list_events(db, desde, hasta):
                add("google", e["id"], e["title"], e["start"],
                    e["description"] or e["calendar_name"], None,
                    {"all_day": e["all_day"],
                     "end": e["end"].isoformat() if e["end"] else None,
                     "link": e["link"],
                     "calendar_id": e["calendar_id"],
                     "calendar_name": e["calendar_name"]})
        except gcal.GoogleError:
            pass  # si Google falla, el resto del calendario debe seguir funcionando

    if "tarea" in wanted:
        q = db.query(Todo).filter(
            Todo.due_date.isnot(None), Todo.due_date >= desde, Todo.due_date < hasta
        )
        for t in q:
            add("tarea", t.id, t.title, t.due_date,
                "completada" if t.status == "completada" else "pendiente",
                t.context_id,
                {"done": t.status == "completada", "priority": t.priority})

    if "suscripcion" in wanted:
        for s in db.query(Subscription).filter(Subscription.next_due.isnot(None)):
            months = PERIOD_MONTHS.get(s.period, 1)
            for when in occurrences(s.next_due, months, desde, hasta):
                add("suscripcion", s.id, s.name, when,
                    _money(s.amount, s.currency or BASE_CURRENCY))

    if "pago" in wanted:
        for r in db.query(RecurringPayment).filter(RecurringPayment.next_due.isnot(None)):
            faltan = r.installments_total - r.installments_paid
            if faltan <= 0:
                continue
            months = PERIOD_MONTHS.get(r.frequency, 1)
            fechas = occurrences(r.next_due, months, desde, hasta, limit=faltan)
            for index, when in enumerate(fechas):
                cuota = r.installments_paid + index + 1
                if cuota > r.installments_total:
                    break
                add("pago", r.id, r.name, when,
                    f"{_money(r.installment_amount, r.currency or BASE_CURRENCY)}"
                    f" · cuota {cuota}/{r.installments_total}")

    if "meta" in wanted:
        for g in db.query(Goal).filter(
            Goal.deadline.isnot(None), Goal.deadline >= desde, Goal.deadline < hasta
        ):
            add("meta", g.id, g.name, g.deadline, f"objetivo {_money(g.target_amount)}")

    if "nota" in wanted:
        for n in db.query(Note).filter(Note.created_at >= desde, Note.created_at < hasta):
            add("nota", n.id, n.title, n.created_at,
                "nota de voz" if n.audio_path else None, n.context_id)

    if "transaccion" in wanted:
        cuentas = {a.id: a for a in db.query(Account).all()}
        q = db.query(Transaction).filter(
            Transaction.occurred_at >= desde, Transaction.occurred_at < hasta
        )
        for t in q:
            cuenta = cuentas.get(t.account_id)
            divisa = cuenta.currency if cuenta else BASE_CURRENCY
            add("transaccion", t.id, t.description, t.occurred_at,
                _money(t.amount, divisa), t.context_id, {"type": t.type})

    items.sort(key=lambda i: i["date"])
    return items
