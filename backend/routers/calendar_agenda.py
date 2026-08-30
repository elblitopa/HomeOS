"""Agenda unificada: junta en una sola lista todo lo que tiene fecha en HomeOS
(eventos, tareas, suscripciones, deudas, metas, notas y transacciones) para
que el calendario general pueda mostrarlo todo junto.
"""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    BASE_CURRENCY,
    Account,
    BusinessEvent,
    Context,
    Event,
    ExchangeRate,
    Goal,
    Loan,
    Note,
    PERIOD_MONTHS,
    RecurringPayment,
    ScheduledTransaction,
    Subscription,
    Todo,
    Transaction,
)
from backend.services import fx
from backend.services import google_calendar as gcal
from backend.services.dates import add_months, occurrences
from backend.services.google_sync import sync_aparte
from backend.services.saldos import goal_saved

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

KINDS = [
    "evento", "google", "tarea", "suscripcion", "pago", "meta", "nota",
    "programado", "agenda", "transaccion", "prestamo",
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

    if "google" in wanted and gcal.estado(db) == "conectado":
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
        ahorrado = goal_saved(db)
        for g in db.query(Goal).filter(
            Goal.deadline.isnot(None), Goal.deadline >= desde, Goal.deadline < hasta
        ):
            # una meta ya alcanzada no es un pendiente del calendario: fuera,
            # en vez de gritarle al usuario que "vencio" algo que ya logro
            if g.target_amount and ahorrado.get(g.id, 0.0) >= g.target_amount:
                continue
            add("meta", g.id, g.name, g.deadline, f"objetivo {_money(g.target_amount)}")

    if "prestamo" in wanted:
        # solo los pendientes con fecha prometida: los pagados ya se ven como
        # el ingreso de su transaccion
        q = db.query(Loan).filter(
            Loan.status == "prestado",
            Loan.promised_date.isnot(None),
            Loan.promised_date >= desde,
            Loan.promised_date < hasta,
        )
        for l in q:
            esperado = l.expected_amount or l.amount
            add("prestamo", l.id, f"Prestamo — {l.person}", l.promised_date,
                f"+{_money(esperado, l.currency or BASE_CURRENCY)} · prometido")

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

    if "agenda" in wanted:
        # eventos de clientes de los negocios con Agenda prendida: si el
        # negocio la apaga, sus eventos dejan de salir aqui sin borrarse.
        # El margen hacia atras es para atrapar eventos que empezaron antes
        # del rango pero siguen dentro (una tocada de 7:30 pm a 1:00 am
        # abarca dos dias y debe verse en los dos).
        q = (
            db.query(BusinessEvent)
            .join(Context, Context.id == BusinessEvent.context_id)
            .filter(
                Context.has_agenda == 1,
                BusinessEvent.start >= desde - timedelta(days=14),
                BusinessEvent.start < hasta,
            )
        )
        for ev in q:
            partes = [_money(ev.amount)]
            if ev.municipality:
                partes.append(ev.municipality)
            partes.append("reservado" if (ev.deposit or 0) > 0 else "sin anticipo")
            detalle = " · ".join(partes)
            extra = {"end": ev.end.isoformat() if ev.end else None,
                     "reserved": (ev.deposit or 0) > 0}
            # una ocurrencia por dia cubierto, con el mismo ref_id — la misma
            # expansion virtual que ya hacen suscripciones y pagos
            fin = ev.end or ev.start
            dia, pasos = ev.start.date(), 0
            while dia <= fin.date() and pasos < 14:
                cuando = ev.start if pasos == 0 else datetime.combine(dia, datetime.min.time())
                if desde <= cuando < hasta:
                    titulo = ev.client_name if pasos == 0 else f"↪ {ev.client_name}"
                    add("agenda", ev.id, titulo, cuando, detalle, ev.context_id,
                        {**extra, "continuacion": pasos > 0})
                dia += timedelta(days=1)
                pasos += 1

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


# ---------- mover con drag & drop ----------

# tipos que se pueden arrastrar a otro dia. Las suscripciones/pagos son fechas
# recurrentes calculadas y las transacciones/notas son historial: no se mueven.
MOVABLE = {"evento", "tarea", "google", "meta", "programado", "agenda", "prestamo"}


class MovePayload(BaseModel):
    kind: str
    ref_id: str
    day: date                      # nuevo dia; la hora del elemento se conserva
    # solo para eventos de Google (no viven en la base local):
    calendar_id: str | None = None
    start: datetime | None = None  # inicio actual
    end: datetime | None = None
    all_day: bool = False


@router.post("/move")
def move_item(payload: MovePayload, tareas: BackgroundTasks, db: Session = Depends(get_db)):
    """Cambia el dia de un elemento conservando su hora."""
    kind = payload.kind
    if kind not in MOVABLE:
        raise HTTPException(400, f"Los elementos de tipo '{kind}' no se pueden mover")

    def mismo_horario(dt: datetime) -> datetime:
        return datetime.combine(payload.day, dt.time())

    if kind == "evento":
        e = db.get(Event, int(payload.ref_id))
        if not e:
            raise HTTPException(404, "Evento no encontrado")
        delta = mismo_horario(e.start) - e.start
        e.start = e.start + delta
        if e.end:
            e.end = e.end + delta  # conserva la duracion, incluso si dura varios dias
        db.commit()
        tareas.add_task(sync_aparte)  # actualiza el espejo en Google
        return {"moved": True, "date": e.start.isoformat()}

    if kind == "tarea":
        t = db.get(Todo, int(payload.ref_id))
        if not t or not t.due_date:
            raise HTTPException(404, "Tarea no encontrada")
        t.due_date = mismo_horario(t.due_date)
        db.commit()
        return {"moved": True, "date": t.due_date.isoformat()}

    if kind == "meta":
        g = db.get(Goal, int(payload.ref_id))
        if not g or not g.deadline:
            raise HTTPException(404, "Meta no encontrada")
        g.deadline = mismo_horario(g.deadline)
        db.commit()
        return {"moved": True, "date": g.deadline.isoformat()}

    if kind == "programado":
        p = db.get(ScheduledTransaction, int(payload.ref_id))
        if not p:
            raise HTTPException(404, "Movimiento programado no encontrado")
        p.scheduled_for = mismo_horario(p.scheduled_for)
        db.commit()
        return {"moved": True, "date": p.scheduled_for.isoformat()}

    if kind == "prestamo":
        l = db.get(Loan, int(payload.ref_id))
        if not l or not l.promised_date:
            raise HTTPException(404, "Prestamo no encontrado")
        l.promised_date = mismo_horario(l.promised_date)
        db.commit()
        return {"moved": True, "date": l.promised_date.isoformat()}

    if kind == "agenda":
        ev = db.get(BusinessEvent, int(payload.ref_id))
        if not ev:
            raise HTTPException(404, "Evento de agenda no encontrado")
        delta = mismo_horario(ev.start) - ev.start
        ev.start = ev.start + delta
        if ev.end:
            ev.end = ev.end + delta  # conserva la duracion
        db.commit()
        return {"moved": True, "date": ev.start.isoformat()}

    # google: el evento no vive aqui, asi que el frontend manda su horario
    # actual y solo se recorre el dia via PATCH (el resto no se toca)
    if not payload.start:
        raise HTTPException(400, "Falta el inicio actual del evento de Google")
    start = payload.start
    delta = mismo_horario(start) - start
    nuevo_inicio = start + delta
    nuevo_fin = payload.end + delta if payload.end else None
    if payload.all_day:
        # en Google el fin de un evento de dia completo es exclusivo, y asi
        # llega desde la agenda, por lo que el corrimiento lo respeta
        body = {
            "start": {"date": nuevo_inicio.strftime("%Y-%m-%d")},
            "end": {"date": (nuevo_fin or nuevo_inicio + timedelta(days=1)).strftime("%Y-%m-%d")},
        }
    else:
        body = {
            "start": {"dateTime": nuevo_inicio.astimezone().isoformat()},
            "end": {"dateTime": (nuevo_fin or nuevo_inicio + timedelta(hours=1)).astimezone().isoformat()},
        }
    try:
        gcal.patch_raw(db, payload.calendar_id or gcal.calendar_id(db), payload.ref_id, body)
    except gcal.GoogleError as e:
        raise HTTPException(502, f"Google no acepto el cambio: {e}")
    return {"moved": True, "date": nuevo_inicio.isoformat()}


# ---------- detalle de un bloque ----------

# Los kinds que NO pasan por aqui: "tarea" tiene su propio GET /api/todos/{id}
# con toda su linea de tiempo, y "google" ya viaja completo en la agenda —
# pedirselo otra vez a Google seria latencia y un modo de fallo a cambio de nada.
RESOLVERS: dict = {}


def _campo(label: str, value, tipo: str = "texto", **extra) -> dict | None:
    """Una fila del detalle. None si no hay valor: asi el frontend nunca tiene
    que preguntar por campos vacios ni pintar un guion."""
    if value is None or value == "":
        return None
    return {"label": label, "type": tipo, "value": value, **extra}


def _badge(text: str | None, tone: str = "neutral") -> dict | None:
    return {"text": text, "tone": tone} if text else None


def _sobre(kind: str, ref_id, title: str, cuando: datetime | None, **resto) -> dict:
    """Forma comun de la respuesta; los resolvers solo llenan lo suyo."""
    base = {
        "kind": kind,
        "ref_id": ref_id,
        "title": title,
        "date": cuando.isoformat() if cuando else None,
        "description": None,
        "context_id": None,
        "amount": None,
        "badges": [],
        "fields": [],
        "media": [],
        "ocurrencia": None,
        "link": None,
        "actions": [],
        "data": None,
    }
    base.update(resto)
    # se limpian los huecos aqui, una sola vez, en vez de en cada resolver
    base["fields"] = [f for f in base["fields"] if f]
    base["badges"] = [b for b in base["badges"] if b]
    base["media"] = [m for m in base["media"] if m and m.get("path")]
    return base


def _dinero(value: float, currency: str = BASE_CURRENCY, sign: str | None = None) -> dict:
    return {"value": round(value, 2), "currency": currency or BASE_CURRENCY, "sign": sign}


def _texto_avisos(minutos: list | None) -> str | None:
    """[30, 1440] -> '30 min y 1 dia antes'."""
    if not minutos:
        return None
    partes = []
    for m in sorted(minutos):
        if m <= 0:
            partes.append("a la hora")
        elif m < 60:
            partes.append(f"{m} min")
        elif m < 1440:
            h = m // 60
            partes.append(f"{h} hora{'s' if h > 1 else ''}")
        else:
            d = m // 1440
            partes.append(f"{d} dia{'s' if d > 1 else ''}")
    if len(partes) == 1:
        return f"{partes[0]} antes"
    return f"{', '.join(partes[:-1])} y {partes[-1]} antes"


def _detalle_evento(db: Session, ref_id: int, cuando: datetime | None) -> dict | None:
    e = db.get(Event, ref_id)
    if not e:
        return None
    return _sobre(
        "evento", e.id, e.title, e.start,
        description=e.description,
        context_id=e.context_id,
        badges=[
            _badge("Todo el dia" if e.all_day else None),
            _badge("También en Google" if e.sync_google else None, "accent"),
        ],
        fields=[
            _campo("Termina", e.end.isoformat() if e.end else None, "fecha"),
            _campo("Avisos por Discord", _texto_avisos(e.reminders)),
        ],
        actions=[{"id": "editar", "label": "Editar", "tone": "primary"}],
        data=e.to_dict(),
    )


def _detalle_nota(db: Session, ref_id: int, cuando: datetime | None) -> dict | None:
    n = db.get(Note, ref_id)
    if not n:
        return None
    editada = n.updated_at and n.created_at and (n.updated_at - n.created_at).total_seconds() > 60
    return _sobre(
        "nota", n.id, n.title, n.created_at,
        description=n.content,
        context_id=n.context_id,
        badges=[_badge("Fijada" if n.pinned else None, "accent")],
        fields=[
            _campo("Creada", n.created_at.isoformat(), "fecha"),
            _campo("Editada", n.updated_at.isoformat() if editada else None, "fecha"),
        ],
        media=[{"role": "audio", "path": n.audio_path, "name": "Nota de voz"}]
        if n.audio_path else [],
        actions=[{"id": "ver_en_notas", "label": "Ver en Notas", "tone": "ghost"}],
        data=n.to_dict(),
    )


def _detalle_meta(db: Session, ref_id: int, cuando: datetime | None) -> dict | None:
    g = db.get(Goal, ref_id)
    if not g:
        return None
    ahorrado = goal_saved(db).get(g.id, 0.0)
    datos = g.to_dict(ahorrado)
    falta = max(0.0, g.target_amount - ahorrado)
    dias = datos["days_left"]

    # una meta alcanzada YA no vence: se celebra, no se regaña
    if datos.get("completed"):
        estado = _badge("Completada", "ok")
    elif dias is None:
        estado = None
    elif dias < 0:
        estado = _badge(f"Venció hace {abs(dias)} d", "err")
    elif dias == 0:
        estado = _badge("La fecha límite es hoy", "err")
    else:
        estado = _badge(f"Faltan {dias} días", "neutral")

    # cuanto habria que apartar cada mes para llegar a tiempo
    por_mes = None
    if falta > 0 and dias and dias > 0:
        por_mes = round(falta / max(1, dias / 30), 2)

    return _sobre(
        "meta", g.id, g.name, g.deadline,
        amount=_dinero(g.target_amount),
        badges=[estado],
        fields=[
            _campo("Avance", datos["progress"], "progreso",
                   hint=f"ahorrado ${ahorrado:,.2f} de ${g.target_amount:,.2f}"),
            _campo("Objetivo", g.target_amount, "dinero", currency=BASE_CURRENCY),
            _campo("Ahorrado", ahorrado, "dinero", currency=BASE_CURRENCY),
            _campo("Falta", falta if falta > 0 else None, "dinero", currency=BASE_CURRENCY),
            _campo("Para llegar a tiempo", por_mes, "dinero", currency=BASE_CURRENCY,
                   hint="al mes"),
            _campo("Fecha límite", g.deadline.isoformat() if g.deadline else None, "fecha"),
        ],
        media=[{"role": "banner", "path": g.banner_path, "name": g.name}]
        if g.banner_path else [],
        actions=[{"id": "editar", "label": "Editar meta", "tone": "primary"}],
        data=datos,
    )


def _cuenta(db: Session, account_id: int | None) -> Account | None:
    return db.get(Account, account_id) if account_id else None


def _campo_cuenta(db: Session, label: str, account_id: int | None) -> dict | None:
    cuenta = _cuenta(db, account_id)
    if not cuenta:
        return None
    return _campo(label, cuenta.name, color=cuenta.color,
                  hint=cuenta.bank or None)


def _campo_categoria(db: Session, category_id: int | None) -> dict | None:
    from backend.models import Category

    cat = db.get(Category, category_id) if category_id else None
    return _campo("Categoría", cat.name, icon=cat.icon) if cat else None


def _signo(tipo: str) -> str | None:
    return {"ingreso": "+", "egreso": "-"}.get(tipo)


def _detalle_transaccion(db: Session, ref_id: int, cuando: datetime | None) -> dict | None:
    t = db.get(Transaction, ref_id)
    if not t:
        return None
    cuenta = _cuenta(db, t.account_id)
    divisa = cuenta.currency if cuenta else BASE_CURRENCY
    destino = _cuenta(db, t.to_account_id)
    meta = db.get(Goal, t.to_goal_id) if t.to_goal_id else None

    # el equivalente en pesos solo tiene sentido si la cuenta no es de pesos,
    # y se muestra con la tasa CONGELADA del dia en que ocurrio
    equivalente = None
    if divisa != BASE_CURRENCY:
        equivalente = _campo(
            "Equivalente", round(t.amount * (t.fx_rate or 1.0), 2), "dinero",
            currency=BASE_CURRENCY,
            hint=f"tipo de cambio congelado: {t.fx_rate}" if t.fx_rate
            else "tipo de cambio no registrado",
        )

    return _sobre(
        "transaccion", t.id, t.description, t.occurred_at,
        context_id=t.context_id,
        amount=_dinero(t.amount, divisa, _signo(t.type)),
        badges=[_badge({"ingreso": "Ingreso", "egreso": "Egreso"}.get(t.type, "Transferencia"),
                       {"ingreso": "ok", "egreso": "err"}.get(t.type, "accent"))],
        fields=[
            _campo("Cuándo", t.occurred_at.isoformat(), "fecha"),
            _campo_cuenta(db, "Desde la cuenta" if t.type == "transferencia" else "Cuenta",
                          t.account_id),
            _campo("Hacia", destino.name if destino else (f"🎯 {meta.name}" if meta else None)),
            _campo_categoria(db, t.category_id),
            equivalente,
        ],
        media=[{"role": "comprobante", "path": t.attachment_path, "name": t.attachment_name}]
        if t.attachment_path else [],
        actions=[{"id": "editar", "label": "Editar", "tone": "primary"}],
        data=t.to_dict(),
    )


def _detalle_programado(db: Session, ref_id: int, cuando: datetime | None) -> dict | None:
    p = db.get(ScheduledTransaction, ref_id)
    if not p:
        return None
    datos = p.to_dict(fx.current_rate(db, p.currency))
    cuenta = _cuenta(db, p.account_id)
    destino = _cuenta(db, p.to_account_id)
    meta = db.get(Goal, p.to_goal_id) if p.to_goal_id else None
    dias = datos["days_left"]

    if p.status == "concretado":
        estado = _badge("Concretado", "ok")
    elif p.status == "cancelado":
        estado = _badge("No se concretó", "neutral")
    elif dias < 0:
        estado = _badge(f"Venció hace {abs(dias)} d", "err")
    elif dias == 0:
        estado = _badge("Es hoy", "err")
    elif dias == 1:
        estado = _badge("Es mañana", "accent")
    else:
        estado = _badge(f"Faltan {dias} días", "neutral")

    # el estimado en pesos es con la tasa de HOY, no una congelada: la
    # conversion real ocurre el dia que se concreta
    estimado = None
    if cuenta and (p.currency or BASE_CURRENCY) != cuenta.currency:
        estimado = _campo("Estimado", datos["amount_mxn_estimado"], "dinero",
                          currency=BASE_CURRENCY,
                          hint="con el tipo de cambio de hoy")

    aplazos = None
    if p.postponed_count:
        veces = "vez" if p.postponed_count == 1 else "veces"
        aplazos = _campo(
            "Aplazado", f"{p.postponed_count} {veces}",
            hint=f"originalmente el {p.original_scheduled_for.strftime('%d/%m/%Y')}"
            if p.original_scheduled_for else None,
        )

    acciones = []
    if p.status == "pendiente":
        acciones = [
            {"id": "concretar", "label": "✓ Concretar", "tone": "ok"},
            {"id": "aplazar", "label": "📅 Aplazar", "tone": "ghost"},
            {"id": "editar", "label": "Editar", "tone": "ghost"},
            {"id": "cancelar", "label": "No se concretó", "tone": "danger"},
        ]

    return _sobre(
        "programado", p.id, p.description, p.scheduled_for,
        description=p.note,
        context_id=p.context_id,
        amount=_dinero(p.amount, p.currency, _signo(p.type)),
        badges=[estado],
        fields=[
            _campo("Fecha programada", p.scheduled_for.isoformat(), "fecha"),
            aplazos,
            _campo_cuenta(db, "Cuenta", p.account_id),
            _campo("Hacia", destino.name if destino else (f"🎯 {meta.name}" if meta else None)),
            _campo_categoria(db, p.category_id),
            estimado,
            _campo("Monto real", p.actual_amount if p.status == "concretado" else None,
                   "dinero", currency=p.currency or BASE_CURRENCY,
                   hint=f"se programó ${p.amount:,.2f}" if p.actual_amount != p.amount else None),
            _campo("Se resolvió", p.resolved_at.isoformat() if p.resolved_at else None, "fecha"),
        ],
        media=[{"role": "comprobante", "path": p.attachment_path, "name": p.attachment_name}]
        if p.attachment_path else [],
        actions=acciones,
        data=datos,
    )


def _ocurrencia(cuando: datetime | None, next_due: datetime | None, etiqueta: str) -> dict | None:
    """Bloque que distingue una fecha proyectada del proximo cobro real."""
    if not next_due:
        return {"es_proxima": False, "next_due": None,
                "aviso": "Esta serie ya no tiene fecha de cobro configurada."}
    es_proxima = bool(cuando) and cuando.date() == next_due.date()
    return {
        "es_proxima": es_proxima,
        "next_due": next_due.isoformat(),
        "aviso": None if es_proxima else
        f"Esta fecha es una proyección del calendario. El {etiqueta} real es el "
        f"{next_due.strftime('%d/%m/%Y')}.",
    }


def _detalle_suscripcion(db: Session, ref_id: int, cuando: datetime | None) -> dict | None:
    s = db.get(Subscription, ref_id)
    if not s:
        return None
    datos = s.to_dict(fx.current_rate(db, s.currency))
    cuenta = _cuenta(db, s.account_id)
    meses = PERIOD_MONTHS.get(s.period, 1)
    ocurrencia = _ocurrencia(cuando, s.next_due, "próximo cobro")

    estimado = None
    if cuenta and (s.currency or BASE_CURRENCY) != cuenta.currency:
        estimado = _campo("Equivalente", datos["amount_mxn"], "dinero",
                          currency=BASE_CURRENCY, hint="con el tipo de cambio de hoy")

    return _sobre(
        "suscripcion", s.id, s.name, cuando or s.next_due,
        amount=_dinero(s.amount, s.currency, "-"),
        badges=[
            _badge(f"Cobro {s.period}"),
            _badge("Proyección" if ocurrencia and not ocurrencia["es_proxima"] else None, "accent"),
        ],
        fields=[
            _campo("Este cobro", (cuando or s.next_due).isoformat() if (cuando or s.next_due) else None, "fecha"),
            _campo("Próximo cobro real",
                   s.next_due.isoformat() if s.next_due and ocurrencia
                   and not ocurrencia["es_proxima"] else None, "fecha"),
            _campo_cuenta(db, "Se carga a", s.account_id),
            _campo_categoria(db, s.category_id),
            estimado,
            _campo("Costo al año", round(s.amount * 12 / meses, 2), "dinero",
                   currency=s.currency or BASE_CURRENCY),
        ],
        ocurrencia=ocurrencia,
        # cobrar siempre avanza el next_due, asi que solo tiene sentido
        # ofrecerlo cuando lo que se abrio ES el proximo cobro
        actions=([{"id": "cobrar", "label": "Registrar cobro", "tone": "primary"}]
                 if ocurrencia and ocurrencia["es_proxima"] else [])
        + [{"id": "ver_en_finanzas", "label": "Ver en Finanzas", "tone": "ghost"}],
        data=datos,
    )


def _detalle_pago(db: Session, ref_id: int, cuando: datetime | None) -> dict | None:
    r = db.get(RecurringPayment, ref_id)
    if not r:
        return None
    datos = r.to_dict(fx.current_rate(db, r.currency))
    cobro = (r.type or "egreso") == "ingreso"
    cuota = _cuota_en(r, cuando)
    ocurrencia = _ocurrencia(cuando, r.next_due, "próximo abono" if cobro else "próximo pago")
    liquidado = r.installments_paid >= r.installments_total
    etiqueta = "Abono" if cobro else "Cuota"

    return _sobre(
        "pago", r.id, r.name, cuando or r.next_due,
        amount=_dinero(r.installment_amount, r.currency, "+" if cobro else "-"),
        badges=[
            _badge(f"{etiqueta} {cuota} de {r.installments_total}" if cuota else None),
            _badge("Liquidado" if liquidado else None, "ok"),
            _badge("Proyección" if ocurrencia and not ocurrencia["es_proxima"] else None, "accent"),
            _badge("Esta fecha ya no es parte de la serie" if cuota is None and cuando else None,
                   "err"),
        ],
        fields=[
            _campo(f"{etiqueta} de", r.installment_amount, "dinero",
                   currency=r.currency or BASE_CURRENCY),
            _campo("Esta fecha", (cuando or r.next_due).isoformat() if (cuando or r.next_due) else None, "fecha"),
            _campo("Próxima fecha real",
                   r.next_due.isoformat() if r.next_due and ocurrencia
                   and not ocurrencia["es_proxima"] else None, "fecha"),
            _campo("Avance actual", datos["progress"], "progreso",
                   hint=f"{'recibido' if cobro else 'pagado'} ${r.paid_amount:,.2f} · "
                        f"falta ${datos['pending_amount']:,.2f}"),
            _campo_cuenta(db, "Se carga a", r.account_id),
            _campo_categoria(db, r.category_id),
            _campo("Frecuencia", r.frequency),
        ],
        ocurrencia=ocurrencia,
        actions=([{"id": "cobrar", "label": f"Registrar {etiqueta.lower()}", "tone": "primary"}]
                 if ocurrencia and ocurrencia["es_proxima"] and not liquidado else [])
        + [{"id": "ver_en_finanzas", "label": "Ver en Finanzas", "tone": "ghost"}],
        data=datos,
    )


def _detalle_agenda(db: Session, ref_id: int, cuando: datetime | None) -> dict | None:
    ev = db.get(BusinessEvent, ref_id)
    if not ev:
        return None
    negocio = db.get(Context, ev.context_id)
    reservado = (ev.deposit or 0) > 0
    restante = max(0.0, (ev.amount or 0) - (ev.deposit or 0))
    return _sobre(
        "agenda", ev.id, ev.client_name, ev.start,
        context_id=ev.context_id,
        amount=_dinero(ev.amount, BASE_CURRENCY, "+"),
        link=ev.place_url,
        badges=[
            _badge(f"Reservado ${ev.deposit:,.0f}" if reservado else "Sin anticipo",
                   "ok" if reservado else "neutral"),
            _badge(negocio.name if negocio else None, "accent"),
        ],
        fields=[
            # tipo "telefono": el modal pinta el menú de WhatsApp / Llamar
            _campo("Teléfono", ev.phone, "telefono"),
            _campo("Empieza", ev.start.isoformat(), "fecha"),
            _campo("Termina", ev.end.isoformat() if ev.end else None, "fecha"),
            # con link de maps el lugar es clicable; sin él, texto normal
            _campo("Lugar", ev.place or ("Ver en maps" if ev.place_url else None),
                   "link" if ev.place_url else "texto",
                   url=ev.place_url, hint=ev.municipality),
            _campo("Municipio", ev.municipality if not ev.place else None),
            _campo("Renta", ", ".join(ev.rentals or []) or None),
            _campo("Anticipo", ev.deposit if reservado else None, "dinero",
                   currency=BASE_CURRENCY),
            _campo("Restante", restante if reservado else None, "dinero",
                   currency=BASE_CURRENCY),
            _campo("Comentarios", ev.comments, "multilinea"),
        ],
        media=[{"role": "banner", "path": ev.image_path, "name": ev.client_name}]
        if ev.image_path else [],
        actions=[{"id": "ver_en_negocio", "label": "Ver en el negocio", "tone": "ghost"}],
        data=ev.to_dict(),
    )


def _detalle_prestamo(db: Session, ref_id: int, cuando: datetime | None) -> dict | None:
    l = db.get(Loan, ref_id)
    if not l:
        return None
    datos = l.to_dict(fx.current_rate(db, l.currency))
    esperado = l.expected_amount or l.amount
    dias = datos["days_left"]

    if l.status == "pagado":
        estado = _badge("Pagado", "ok")
    elif dias is None:
        estado = None
    elif dias < 0:
        estado = _badge(f"Prometido hace {abs(dias)} d", "err")
    elif dias == 0:
        estado = _badge("Prometió pagar hoy", "err")
    else:
        estado = _badge(f"Faltan {dias} días", "neutral")

    cuenta = db.get(Account, l.account_id) if l.account_id else None
    return _sobre(
        "prestamo", l.id, f"Préstamo — {l.person}", l.promised_date or l.lent_date,
        description=l.note,
        amount=_dinero(esperado, l.currency, "+"),
        badges=[estado],
        fields=[
            _campo("Persona", l.person),
            _campo("Teléfono", l.phone, "telefono"),
            _campo("Prestado", l.amount, "dinero", currency=l.currency),
            _campo("Espero recibir", esperado if esperado != l.amount else None,
                   "dinero", currency=l.currency),
            _campo("Intereses / extra", l.extra),
            _campo("Salió de", cuenta.name if cuenta else None),
            _campo("Fecha del préstamo", l.lent_date.isoformat() if l.lent_date else None,
                   "fecha"),
            _campo("Prometió pagar", l.promised_date.isoformat() if l.promised_date else None,
                   "fecha"),
            _campo("Recibido", l.received_amount, "dinero", currency=l.currency),
            _campo("Pagado el", l.paid_at.isoformat() if l.paid_at else None, "fecha"),
        ],
        data=datos,
    )


RESOLVERS.update({
    "evento": _detalle_evento,
    "nota": _detalle_nota,
    "meta": _detalle_meta,
    "transaccion": _detalle_transaccion,
    "programado": _detalle_programado,
    "suscripcion": _detalle_suscripcion,
    "pago": _detalle_pago,
    "agenda": _detalle_agenda,
    "prestamo": _detalle_prestamo,
})


@router.get("/item")
def item_detail(
    kind: str = Query(...),
    ref_id: str = Query(...),
    # no se puede llamar "date" a la variable: el modulo importa
    # `from datetime import date` y quedaria sombreado dentro de la funcion
    fecha: datetime | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
):
    """Detalle completo de un bloque del calendario.

    La identidad de un bloque es la tripleta (kind, ref_id, date): las
    suscripciones y los pagos se expanden a ocurrencias virtuales que
    comparten ref_id, asi que la fecha hace falta para saber cual se abrio.
    """
    if kind in ("tarea", "google"):
        raise HTTPException(
            400, f"El detalle de '{kind}' se arma en el cliente, no aqui."
        )
    resolver = RESOLVERS.get(kind)
    if not resolver:
        raise HTTPException(400, f"Tipo desconocido: {kind}")
    try:
        local_id = int(ref_id)
    except (TypeError, ValueError):
        raise HTTPException(400, "ref_id invalido")

    detalle = resolver(db, local_id, fecha)
    if detalle is None:
        raise HTTPException(404, "Este elemento ya no existe")
    return detalle
