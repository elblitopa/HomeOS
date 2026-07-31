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
    ScheduledTransaction,
    Subscription,
    Todo,
    Transaction,
)
from backend.services import google_calendar as gcal
from backend.services.dates import add_months, occurrences

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

KINDS = [
    "evento", "google", "tarea", "suscripcion", "pago", "meta", "nota",
    "programado", "transaccion",
]


def _money(amount: float, currency: str = BASE_CURRENCY) -> str:
    return f"${amount:,.2f} {currency}"


def _cuota_en(r: RecurringPayment, cuando: datetime | None) -> int | None:
    """Numero de cuota que cae en esa fecha, contando desde next_due.

    No sirve el indice de la lista que devuelve occurrences(): esa lista ya
    viene recortada al rango visible, asi que al navegar a un mes lejano el
    indice arranca de cero otra vez y el numero de cuota se queda clavado.
    Regresa None si la fecha ya no pertenece a la serie (se edito next_due).
    """
    if not r.next_due or not cuando:
        return None
    meses = PERIOD_MONTHS.get(r.frequency, 1)
    if meses <= 0:
        return None
    cursor, saltos = r.next_due, 0
    while cursor.date() < cuando.date() and saltos < 500:
        cursor = add_months(cursor, meses)
        saltos += 1
    if cursor.date() != cuando.date():
        return None
    return r.installments_paid + saltos + 1


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
            cobro = (r.type or "egreso") == "ingreso"
            for when in fechas:
                cuota = _cuota_en(r, when)
                if cuota is None or cuota > r.installments_total:
                    break
                add("pago", r.id, r.name, when,
                    f"{'+' if cobro else '−'}"
                    f"{_money(r.installment_amount, r.currency or BASE_CURRENCY)}"
                    f" · {'abono' if cobro else 'cuota'} {cuota}/{r.installments_total}",
                    None, {"type": "ingreso" if cobro else "egreso"})

    if "meta" in wanted:
        for g in db.query(Goal).filter(
            Goal.deadline.isnot(None), Goal.deadline >= desde, Goal.deadline < hasta
        ):
            add("meta", g.id, g.name, g.deadline, f"objetivo {_money(g.target_amount)}")

    if "nota" in wanted:
        for n in db.query(Note).filter(Note.created_at >= desde, Note.created_at < hasta):
            add("nota", n.id, n.title, n.created_at,
                "nota de voz" if n.audio_path else None, n.context_id)

    if "programado" in wanted:
        # solo los que siguen pendientes: los concretados ya se ven como
        # transaccion y los cancelados no van a pasar
        q = db.query(ScheduledTransaction).filter(
            ScheduledTransaction.status == "pendiente",
            ScheduledTransaction.scheduled_for >= desde,
            ScheduledTransaction.scheduled_for < hasta,
        )
        for p in q:
            signo = "+" if p.type == "ingreso" else "−"
            add("programado", p.id, p.description, p.scheduled_for,
                f"{signo}{_money(p.amount, p.currency or BASE_CURRENCY)} · por confirmar",
                p.context_id, {"type": p.type})

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
