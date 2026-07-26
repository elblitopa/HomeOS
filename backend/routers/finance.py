import calendar
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    Account,
    BASE_CURRENCY,
    Category,
    ExchangeRate,
    Goal,
    PERIOD_MONTHS,
    RecurringPayment,
    Subscription,
    Transaction,
)
from backend.services import fx

router = APIRouter(prefix="/api/finance", tags=["finance"])


def _add_months(dt: datetime, months: int) -> datetime:
    month = dt.month - 1 + months
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


# ---------- balances ----------

def _account_balances(db: Session) -> dict[int, float]:
    """balance = inicial + ingresos - egresos - transferencias salientes + entrantes.
    Cada balance queda en la divisa de su propia cuenta."""
    accounts = db.query(Account).all()
    balances = {a.id: a.initial_balance for a in accounts}
    currency_of = {a.id: a.currency for a in accounts}
    rates = {r.code: r.rate_to_mxn for r in db.query(ExchangeRate).all()}

    rows = (
        db.query(Transaction.account_id, Transaction.type, func.sum(Transaction.amount))
        .group_by(Transaction.account_id, Transaction.type)
        .all()
    )
    for account_id, tx_type, total in rows:
        if account_id not in balances:
            continue
        if tx_type == "ingreso":
            balances[account_id] += total
        else:  # egreso y transferencia restan de la cuenta origen
            balances[account_id] -= total

    # transferencias entrantes: el monto viene en la divisa de la cuenta origen,
    # asi que se convierte si la cuenta destino usa otra
    incoming = (
        db.query(Transaction)
        .filter(Transaction.type == "transferencia", Transaction.to_account_id.isnot(None))
        .all()
    )
    for tx in incoming:
        if tx.to_account_id not in balances:
            continue
        src_rate = tx.fx_rate or rates.get(currency_of.get(tx.account_id), 1.0) or 1.0
        dest_rate = rates.get(currency_of.get(tx.to_account_id), 1.0) or 1.0
        balances[tx.to_account_id] += tx.amount * (src_rate / dest_rate)

    return {k: round(v, 2) for k, v in balances.items()}


def _goal_saved(db: Session) -> dict[int, float]:
    """Lo ahorrado se acumula en MXN, igual que el monto objetivo de la meta."""
    rows = (
        db.query(
            Transaction.to_goal_id,
            func.sum(Transaction.amount * func.coalesce(Transaction.fx_rate, 1.0)),
        )
        .filter(Transaction.type == "transferencia", Transaction.to_goal_id.isnot(None))
        .group_by(Transaction.to_goal_id)
        .all()
    )
    return {goal_id: round(total, 2) for goal_id, total in rows}


# ---------- cuentas ----------

class AccountPayload(BaseModel):
    name: str = Field(min_length=1)
    kind: str = "efectivo"
    scope: str = "personal"
    bank: str | None = None
    currency: str = "MXN"
    initial_balance: float = 0.0
    color: str = "#2383e2"
    banner_path: str | None = None
    sort_order: int = 0


@router.get("/accounts")
def list_accounts(db: Session = Depends(get_db)):
    balances = _account_balances(db)
    rates = {r.code: r.rate_to_mxn for r in db.query(ExchangeRate).all()}
    accounts = db.query(Account).order_by(Account.sort_order, Account.name).all()
    out = []
    for a in accounts:
        balance = balances.get(a.id, 0.0)
        rate = rates.get(a.currency, 1.0)
        out.append(
            {
                **a.to_dict(),
                "balance": balance,
                "balance_mxn": round(balance * rate, 2),
                "fx_rate": rate,
            }
        )
    return out


@router.post("/accounts", status_code=201)
def create_account(payload: AccountPayload, db: Session = Depends(get_db)):
    acc = Account(**payload.model_dump())
    db.add(acc)
    db.commit()
    return acc.to_dict()


@router.put("/accounts/{acc_id}")
def update_account(acc_id: int, payload: AccountPayload, db: Session = Depends(get_db)):
    acc = db.get(Account, acc_id)
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    for key, value in payload.model_dump().items():
        setattr(acc, key, value)
    db.commit()
    return acc.to_dict()


@router.delete("/accounts/{acc_id}")
def delete_account(acc_id: int, db: Session = Depends(get_db)):
    acc = db.get(Account, acc_id)
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    db.delete(acc)  # sus transacciones caen en cascada
    db.commit()
    return {"deleted": True}


# ---------- categorías ----------

class CategoryPayload(BaseModel):
    name: str = Field(min_length=1)
    icon: str = "🏷️"


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    return [c.to_dict() for c in db.query(Category).order_by(Category.name).all()]


@router.post("/categories", status_code=201)
def create_category(payload: CategoryPayload, db: Session = Depends(get_db)):
    if db.query(Category).filter(Category.name == payload.name).first():
        raise HTTPException(409, "Ya existe esa categoría")
    cat = Category(name=payload.name, icon=payload.icon)
    db.add(cat)
    db.commit()
    return cat.to_dict()


@router.delete("/categories/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db)):
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(404, "Categoría no encontrada")
    db.delete(cat)
    db.commit()
    return {"deleted": True}


# ---------- transacciones ----------

class TransactionPayload(BaseModel):
    description: str = Field(min_length=1)
    amount: float = Field(gt=0)
    type: str  # ingreso|egreso|transferencia
    category_id: int | None = None
    account_id: int
    to_account_id: int | None = None
    to_goal_id: int | None = None
    context_id: int | None = None
    occurred_at: datetime | None = None
    attachment_path: str | None = None
    attachment_name: str | None = None


@router.get("/transactions")
def list_transactions(
    type: str | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    context_id: int | None = None,
    today: bool = False,
    month: str | None = None,  # "2026-07"
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = db.query(Transaction)
    if type:
        q = q.filter(Transaction.type == type)
    if account_id:
        q = q.filter(Transaction.account_id == account_id)
    if category_id:
        q = q.filter(Transaction.category_id == category_id)
    if context_id:
        q = q.filter(Transaction.context_id == context_id)
    if today:
        start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        q = q.filter(Transaction.occurred_at >= start)
    if month:
        try:
            y, m = map(int, month.split("-"))
        except ValueError:
            raise HTTPException(400, "Formato de mes inválido, usa YYYY-MM")
        start = datetime(y, m, 1)
        q = q.filter(Transaction.occurred_at >= start, Transaction.occurred_at < _add_months(start, 1))
    txs = q.order_by(Transaction.occurred_at.desc()).limit(min(limit, 1000)).all()
    return [t.to_dict() for t in txs]


def _validate_tx(payload: TransactionPayload, db: Session) -> None:
    if payload.type not in ("ingreso", "egreso", "transferencia"):
        raise HTTPException(400, "Tipo inválido")
    if not db.get(Account, payload.account_id):
        raise HTTPException(400, "La cuenta no existe")
    if payload.type == "transferencia":
        if not payload.to_account_id and not payload.to_goal_id:
            raise HTTPException(400, "La transferencia necesita cuenta o meta destino")
        if payload.to_account_id == payload.account_id:
            raise HTTPException(400, "No puedes transferir a la misma cuenta")


@router.post("/transactions", status_code=201)
def create_transaction(payload: TransactionPayload, db: Session = Depends(get_db)):
    _validate_tx(payload, db)
    data = payload.model_dump()
    if not data.get("occurred_at"):
        data["occurred_at"] = datetime.now()
    # congelar el tipo de cambio del momento para que el historial no se mueva
    account = db.get(Account, payload.account_id)
    data["fx_rate"] = fx.current_rate(db, account.currency if account else None)
    tx = Transaction(**data)
    db.add(tx)
    db.commit()
    return tx.to_dict()


@router.put("/transactions/{tx_id}")
def update_transaction(tx_id: int, payload: TransactionPayload, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transacción no encontrada")
    _validate_tx(payload, db)
    for key, value in payload.model_dump().items():
        if key == "occurred_at" and value is None:
            continue
        setattr(tx, key, value)
    if tx.fx_rate is None:
        account = db.get(Account, tx.account_id)
        tx.fx_rate = fx.current_rate(db, account.currency if account else None)
    db.commit()
    return tx.to_dict()


@router.delete("/transactions/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Transacción no encontrada")
    db.delete(tx)
    db.commit()
    return {"deleted": True}


# ---------- metas ----------

class GoalPayload(BaseModel):
    name: str = Field(min_length=1)
    period: str = "mensual"
    target_amount: float = Field(gt=0)


@router.get("/goals")
def list_goals(db: Session = Depends(get_db)):
    saved = _goal_saved(db)
    return [g.to_dict(saved.get(g.id, 0.0)) for g in db.query(Goal).order_by(Goal.name).all()]


@router.post("/goals", status_code=201)
def create_goal(payload: GoalPayload, db: Session = Depends(get_db)):
    goal = Goal(**payload.model_dump())
    db.add(goal)
    db.commit()
    return goal.to_dict()


@router.put("/goals/{goal_id}")
def update_goal(goal_id: int, payload: GoalPayload, db: Session = Depends(get_db)):
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(404, "Meta no encontrada")
    for key, value in payload.model_dump().items():
        setattr(goal, key, value)
    db.commit()
    saved = _goal_saved(db)
    return goal.to_dict(saved.get(goal.id, 0.0))


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(Goal, goal_id)
    if not goal:
        raise HTTPException(404, "Meta no encontrada")
    db.delete(goal)
    db.commit()
    return {"deleted": True}


# ---------- pagos recurrentes (deudas) ----------

class RecurringPayload(BaseModel):
    name: str = Field(min_length=1)
    total_amount: float = Field(gt=0)
    installment_amount: float = Field(gt=0)
    installments_total: int = Field(gt=0)
    installments_paid: int = 0
    paid_amount: float = 0.0
    frequency: str = "mensual"
    category_id: int | None = None
    account_id: int | None = None
    next_due: datetime | None = None


@router.get("/recurring")
def list_recurring(db: Session = Depends(get_db)):
    items = db.query(RecurringPayment).order_by(RecurringPayment.next_due).all()
    return [r.to_dict() for r in items]


@router.post("/recurring", status_code=201)
def create_recurring(payload: RecurringPayload, db: Session = Depends(get_db)):
    item = RecurringPayment(**payload.model_dump())
    db.add(item)
    db.commit()
    return item.to_dict()


@router.put("/recurring/{item_id}")
def update_recurring(item_id: int, payload: RecurringPayload, db: Session = Depends(get_db)):
    item = db.get(RecurringPayment, item_id)
    if not item:
        raise HTTPException(404, "Pago recurrente no encontrado")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    return item.to_dict()


@router.post("/recurring/{item_id}/pay")
def pay_recurring(item_id: int, db: Session = Depends(get_db)):
    """Registra una cuota: crea el egreso, avanza contador y siguiente pago."""
    item = db.get(RecurringPayment, item_id)
    if not item:
        raise HTTPException(404, "Pago recurrente no encontrado")
    if item.installments_paid >= item.installments_total:
        raise HTTPException(409, "Esta deuda ya está liquidada")
    if item.account_id:
        db.add(
            Transaction(
                description=f"Pago {item.installments_paid + 1}/{item.installments_total}: {item.name}",
                amount=item.installment_amount,
                type="egreso",
                category_id=item.category_id,
                account_id=item.account_id,
                occurred_at=datetime.now(),
            )
        )
    item.installments_paid += 1
    item.paid_amount = round(item.paid_amount + item.installment_amount, 2)
    if item.next_due and item.installments_paid < item.installments_total:
        item.next_due = _add_months(item.next_due, PERIOD_MONTHS.get(item.frequency, 1))
    db.commit()
    return item.to_dict()


@router.delete("/recurring/{item_id}")
def delete_recurring(item_id: int, db: Session = Depends(get_db)):
    item = db.get(RecurringPayment, item_id)
    if not item:
        raise HTTPException(404, "Pago recurrente no encontrado")
    db.delete(item)
    db.commit()
    return {"deleted": True}


# ---------- suscripciones ----------

class SubscriptionPayload(BaseModel):
    name: str = Field(min_length=1)
    amount: float = Field(gt=0)
    period: str = "mensual"
    category_id: int | None = None
    account_id: int | None = None
    next_due: datetime | None = None


@router.get("/subscriptions")
def list_subscriptions(db: Session = Depends(get_db)):
    items = db.query(Subscription).order_by(Subscription.next_due).all()
    return [s.to_dict() for s in items]


@router.post("/subscriptions", status_code=201)
def create_subscription(payload: SubscriptionPayload, db: Session = Depends(get_db)):
    item = Subscription(**payload.model_dump())
    db.add(item)
    db.commit()
    return item.to_dict()


@router.put("/subscriptions/{item_id}")
def update_subscription(item_id: int, payload: SubscriptionPayload, db: Session = Depends(get_db)):
    item = db.get(Subscription, item_id)
    if not item:
        raise HTTPException(404, "Suscripción no encontrada")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    return item.to_dict()


@router.post("/subscriptions/{item_id}/pay")
def pay_subscription(item_id: int, db: Session = Depends(get_db)):
    """Registra el cobro del periodo: crea el egreso y avanza el siguiente pago."""
    item = db.get(Subscription, item_id)
    if not item:
        raise HTTPException(404, "Suscripción no encontrada")
    if item.account_id:
        db.add(
            Transaction(
                description=f"Suscripción: {item.name}",
                amount=item.amount,
                type="egreso",
                category_id=item.category_id,
                account_id=item.account_id,
                occurred_at=datetime.now(),
            )
        )
    if item.next_due:
        item.next_due = _add_months(item.next_due, PERIOD_MONTHS.get(item.period, 1))
    db.commit()
    return item.to_dict()


@router.delete("/subscriptions/{item_id}")
def delete_subscription(item_id: int, db: Session = Depends(get_db)):
    item = db.get(Subscription, item_id)
    if not item:
        raise HTTPException(404, "Suscripción no encontrada")
    db.delete(item)
    db.commit()
    return {"deleted": True}


# ---------- divisas ----------

class RateCreate(BaseModel):
    code: str = Field(min_length=2, max_length=10)
    rate_to_mxn: float | None = Field(default=None, gt=0)
    kind: str = "fiat"  # fiat | cripto
    api_id: str | None = None  # id de CoinGecko para cripto


class RateUpdate(BaseModel):
    rate_to_mxn: float | None = Field(default=None, gt=0)
    manual: bool = False


@router.get("/rates")
def list_rates(db: Session = Depends(get_db)):
    fx.ensure_base(db)
    rows = db.query(ExchangeRate).order_by(ExchangeRate.code).all()
    return [r.to_dict() for r in rows]


@router.post("/rates", status_code=201)
def add_rate(payload: RateCreate, db: Session = Depends(get_db)):
    code = payload.code.upper()
    if db.get(ExchangeRate, code):
        raise HTTPException(409, f"{code} ya está en la lista")
    kind = "cripto" if payload.kind == "cripto" else "fiat"
    api_id = (payload.api_id or "").strip().lower() or None
    manual = payload.rate_to_mxn is not None
    rate = payload.rate_to_mxn
    if not manual:
        # intentar traerlo de la API al momento de agregarlo
        if kind == "cripto":
            rate = fx.fetch_crypto_to_mxn({code: api_id or code.lower()}).get(code)
        else:
            rate = fx.fetch_rates_to_mxn().get(code)
        if not rate:
            raise HTTPException(
                400,
                f"No se encontró el precio de {code}. Captúralo manualmente.",
            )
    row = ExchangeRate(
        code=code,
        rate_to_mxn=round(rate, 2 if rate > 1000 else 10),
        manual=1 if manual else 0,
        source="manual" if manual else "auto",
        kind=kind,
        api_id=api_id,
    )
    db.add(row)
    db.commit()
    return row.to_dict()


@router.put("/rates/{code}")
def update_rate(code: str, payload: RateUpdate, db: Session = Depends(get_db)):
    row = db.get(ExchangeRate, code.upper())
    if not row:
        raise HTTPException(404, "Divisa no encontrada")
    if row.code == BASE_CURRENCY:
        raise HTTPException(400, f"{BASE_CURRENCY} es la divisa base y siempre vale 1")
    if payload.rate_to_mxn is not None:
        value = payload.rate_to_mxn
        row.rate_to_mxn = round(value, 2 if value > 1000 else 10)
        row.updated_at = datetime.now()
    row.manual = 1 if payload.manual else 0
    row.source = "manual" if payload.manual else "auto"
    db.commit()
    if not payload.manual:
        fx.refresh_rates(db, force=True)
        db.refresh(row)
    return row.to_dict()


@router.post("/rates/refresh")
def refresh_rates(db: Session = Depends(get_db)):
    result = fx.refresh_rates(db, force=True)
    rows = db.query(ExchangeRate).order_by(ExchangeRate.code).all()
    return {**result, "rates": [r.to_dict() for r in rows]}


@router.delete("/rates/{code}")
def delete_rate(code: str, db: Session = Depends(get_db)):
    row = db.get(ExchangeRate, code.upper())
    if not row:
        raise HTTPException(404, "Divisa no encontrada")
    if row.code == BASE_CURRENCY:
        raise HTTPException(400, f"No puedes eliminar {BASE_CURRENCY}")
    in_use = db.query(Account).filter(Account.currency == row.code).count()
    if in_use:
        raise HTTPException(409, f"{row.code} está en uso por {in_use} cuenta(s)")
    db.delete(row)
    db.commit()
    return {"deleted": True}


# ---------- resumen ----------

@router.get("/summary")
def summary(context_id: int | None = None, db: Session = Depends(get_db)):
    """Totales por categoría, por mes y del día (excluye transferencias)."""
    q = db.query(
        Transaction.category_id,
        Transaction.type,
        func.sum(Transaction.amount * func.coalesce(Transaction.fx_rate, 1.0)),
    ).filter(Transaction.type.in_(["ingreso", "egreso"]))
    if context_id:
        q = q.filter(Transaction.context_id == context_id)
    by_category: dict = {}
    for cat_id, tx_type, total in q.group_by(Transaction.category_id, Transaction.type):
        entry = by_category.setdefault(cat_id, {"ingresos": 0.0, "egresos": 0.0})
        entry["ingresos" if tx_type == "ingreso" else "egresos"] += total

    qm = db.query(
        func.strftime("%Y-%m", Transaction.occurred_at),
        Transaction.type,
        func.sum(Transaction.amount * func.coalesce(Transaction.fx_rate, 1.0)),
    ).filter(Transaction.type.in_(["ingreso", "egreso"]))
    if context_id:
        qm = qm.filter(Transaction.context_id == context_id)
    by_month: dict = {}
    for month_key, tx_type, total in qm.group_by(
        func.strftime("%Y-%m", Transaction.occurred_at), Transaction.type
    ):
        entry = by_month.setdefault(month_key, {"ingresos": 0.0, "egresos": 0.0})
        entry["ingresos" if tx_type == "ingreso" else "egresos"] += total

    start_today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    qt = db.query(
        Transaction.type,
        func.sum(Transaction.amount * func.coalesce(Transaction.fx_rate, 1.0)),
    ).filter(
        Transaction.type.in_(["ingreso", "egreso"]),
        Transaction.occurred_at >= start_today,
    )
    if context_id:
        qt = qt.filter(Transaction.context_id == context_id)
    today_totals = {"ingresos": 0.0, "egresos": 0.0}
    for tx_type, total in qt.group_by(Transaction.type):
        today_totals["ingresos" if tx_type == "ingreso" else "egresos"] = total

    return {
        "by_category": {
            str(k if k is not None else "none"): {
                **v,
                "balance": round(v["ingresos"] - v["egresos"], 2),
            }
            for k, v in by_category.items()
        },
        "by_month": {
            k: {**v, "balance": round(v["ingresos"] - v["egresos"], 2)}
            for k, v in sorted(by_month.items(), reverse=True)
        },
        "today": today_totals,
    }
