import math
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
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
    Loan,
    PERIOD_MONTHS,
    RecurringPayment,
    ScheduledTransaction,
    Subscription,
    Transaction,
)
from backend.services import fx
from backend.services.dates import add_months
from backend.services.excel import build_budget_xlsx
from backend.services.saldos import goal_saved

router = APIRouter(prefix="/api/finance", tags=["finance"])


def _mes_de(col):
    """Expresión SQL 'AAAA-MM' de una columna de fecha, según el motor.

    strftime solo existe en SQLite; en Postgres el equivalente es to_char.
    Es la única función SQL no portable de todo el backend.
    """
    from backend.database import engine

    if engine.dialect.name == "sqlite":
        return func.strftime("%Y-%m", col)
    return func.to_char(col, "YYYY-MM")


_add_months = add_months  # se movio a services/dates.py y se comparte con el calendario


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


# se movio a services/saldos.py para que el calendario pueda usarla sin
# importar este router; aqui se conserva el nombre de siempre
_goal_saved = goal_saved


# ---------- cuentas ----------

class AccountPayload(BaseModel):
    name: str = Field(min_length=1)
    kind: str = "efectivo"
    scope: str = "personal"
    bank: str | None = None
    currency: str = "MXN"
    initial_balance: float = 0.0
    expected_income: float = 0.0
    color: str = "#2383e2"
    banner_path: str | None = None
    sort_order: int = 0
    is_default: bool = False


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
    if payload.is_default:
        # predeterminada solo puede haber una: se apagan las demas
        db.query(Account).update({"is_default": 0})
    acc = Account(**payload.model_dump())
    db.add(acc)
    db.commit()
    return acc.to_dict()


class ReorderPayload(BaseModel):
    ids: list[int]


@router.post("/accounts/reorder")
def reorder_accounts(payload: ReorderPayload, db: Session = Depends(get_db)):
    """Guarda el acomodo de las tarjetas (drag & drop)."""
    accounts = {a.id: a for a in db.query(Account).all()}
    for index, acc_id in enumerate(payload.ids):
        account = accounts.get(acc_id)
        if account:
            account.sort_order = index
    db.commit()
    return {"ordered": len(payload.ids)}


@router.put("/accounts/{acc_id}")
def update_account(acc_id: int, payload: AccountPayload, db: Session = Depends(get_db)):
    acc = db.get(Account, acc_id)
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    if payload.is_default:
        db.query(Account).filter(Account.id != acc_id).update({"is_default": 0})
    for key, value in payload.model_dump().items():
        setattr(acc, key, value)
    db.commit()
    return acc.to_dict()


class AdjustPayload(BaseModel):
    # el saldo REAL que tiene la cuenta hoy (en su propia divisa)
    real_balance: float


@router.post("/accounts/{acc_id}/adjust", status_code=201)
def adjust_account(acc_id: int, payload: AdjustPayload, db: Session = Depends(get_db)):
    """Cuadra una cuenta con la realidad sin reescribir historia.

    Si unos días no se registraron movimientos, el usuario teclea el saldo
    real y HomeOS crea UNA transacción de ajuste (ingreso o egreso) por la
    diferencia. Así el saldo queda correcto y el historial cuenta la verdad:
    "aquí hubo un ajuste", en vez de tocar initial_balance o inventar fechas.
    """
    acc = db.get(Account, acc_id)
    if not acc:
        raise HTTPException(404, "Cuenta no encontrada")
    actual = _account_balances(db).get(acc_id, 0.0)
    delta = round(payload.real_balance - actual, 2)
    if abs(delta) < 0.005:
        raise HTTPException(400, "El saldo ya coincide: no hay nada que ajustar.")
    tx = Transaction(
        description="Ajuste de saldo",
        amount=abs(delta),
        type="ingreso" if delta > 0 else "egreso",
        account_id=acc_id,
        occurred_at=datetime.now(),
        fx_rate=fx.current_rate(db, acc.currency),
    )
    db.add(tx)
    db.commit()
    return {
        "transaction": tx.to_dict(),
        "old_balance": actual,
        "new_balance": payload.real_balance,
        "delta": delta,
    }


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
    provider_id: int | None = None
    occurred_at: datetime | None = None
    attachment_path: str | None = None
    attachment_name: str | None = None
    via_paypal: bool = False


@router.get("/transactions")
def list_transactions(
    type: str | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    context_id: int | None = None,
    today: bool = False,
    month: str | None = None,  # "2026-07"
    # rango libre [from, to); "from" es palabra reservada de Python, de ahi el alias
    desde: datetime | None = Query(default=None, alias="from"),
    hasta: datetime | None = Query(default=None, alias="to"),
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = db.query(Transaction)
    if desde:
        q = q.filter(Transaction.occurred_at >= desde)
    if hasta:
        q = q.filter(Transaction.occurred_at < hasta)
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
        # acotado por arriba: "hoy" es el dia de hoy, no "de hoy en adelante"
        q = q.filter(Transaction.occurred_at >= start,
                     Transaction.occurred_at < start + timedelta(days=1))
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
    target_amount: float = Field(gt=0)
    deadline: datetime | None = None
    banner_path: str | None = None


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


# ---------- préstamos a personas ----------

class LoanPayload(BaseModel):
    person: str = Field(min_length=1)
    amount: float = Field(gt=0)
    account_id: int
    phone: str | None = None
    lent_date: datetime | None = None
    promised_date: datetime | None = None
    extra: str | None = None          # intereses o algo extra pactado
    expected_amount: float | None = Field(default=None, gt=0)
    note: str | None = None


class LoanEditPayload(BaseModel):
    """Lo editable después de creado. El monto y la cuenta NO: el egreso ya
    quedó en el historial; para corregirlos se borra el préstamo (que se
    lleva sus transacciones) y se captura de nuevo."""
    person: str = Field(min_length=1)
    phone: str | None = None
    promised_date: datetime | None = None
    extra: str | None = None
    expected_amount: float | None = Field(default=None, gt=0)
    note: str | None = None


class LoanPayPayload(BaseModel):
    received_amount: float | None = Field(default=None, gt=0)
    account_id: int | None = None  # a dónde entró el pago (default: la misma)
    note: str | None = None


def _loan_rate(db: Session, loan: Loan) -> float:
    return fx.current_rate(db, loan.currency)


@router.get("/loans")
def list_loans(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Loan)
    if status:
        q = q.filter(Loan.status == status)
    prestamos = q.order_by(Loan.status.desc(), Loan.promised_date.is_(None),
                           Loan.promised_date, Loan.lent_date.desc()).all()
    return [l.to_dict(_loan_rate(db, l)) for l in prestamos]


@router.post("/loans", status_code=201)
def create_loan(payload: LoanPayload, db: Session = Depends(get_db)):
    acc = db.get(Account, payload.account_id)
    if not acc:
        raise HTTPException(400, "La cuenta no existe")
    cuando = payload.lent_date or datetime.now()
    # el dinero salió de verdad: nace el egreso con el tipo de cambio congelado
    tx = Transaction(
        description=f"Préstamo a {payload.person.strip()}",
        amount=payload.amount,
        type="egreso",
        account_id=acc.id,
        occurred_at=cuando,
        fx_rate=fx.current_rate(db, acc.currency),
    )
    db.add(tx)
    db.flush()  # para tener tx.id sin otro commit
    loan = Loan(
        person=payload.person.strip(),
        phone=(payload.phone or "").strip() or None,
        amount=payload.amount,
        currency=acc.currency,
        account_id=acc.id,
        lent_date=cuando,
        promised_date=payload.promised_date,
        extra=(payload.extra or "").strip() or None,
        expected_amount=payload.expected_amount,
        note=(payload.note or "").strip() or None,
        transaction_id=tx.id,
    )
    db.add(loan)
    db.commit()
    return loan.to_dict(_loan_rate(db, loan))


@router.put("/loans/{loan_id}")
def update_loan(loan_id: int, payload: LoanEditPayload, db: Session = Depends(get_db)):
    loan = db.get(Loan, loan_id)
    if not loan:
        raise HTTPException(404, "Préstamo no encontrado")
    loan.person = payload.person.strip()
    loan.phone = (payload.phone or "").strip() or None
    loan.promised_date = payload.promised_date
    loan.extra = (payload.extra or "").strip() or None
    loan.expected_amount = payload.expected_amount
    loan.note = (payload.note or "").strip() or None
    if loan.transaction_id:
        tx = db.get(Transaction, loan.transaction_id)
        if tx:
            tx.description = f"Préstamo a {loan.person}"
    db.commit()
    return loan.to_dict(_loan_rate(db, loan))


@router.post("/loans/{loan_id}/pay")
def pay_loan(loan_id: int, payload: LoanPayPayload | None = None,
             db: Session = Depends(get_db)):
    """La persona pagó: entra el ingreso (con intereses/extra si los hubo)."""
    loan = db.get(Loan, loan_id)
    if not loan:
        raise HTTPException(404, "Préstamo no encontrado")
    if loan.status == "pagado":
        raise HTTPException(409, "Este préstamo ya está marcado como pagado")
    datos = payload or LoanPayPayload()
    destino_id = datos.account_id or loan.account_id
    destino = db.get(Account, destino_id) if destino_id else None
    if not destino:
        raise HTTPException(400, "Elige a qué cuenta entró el pago")
    recibido = datos.received_amount or loan.expected_amount or loan.amount
    tx = Transaction(
        description=f"Pago de préstamo — {loan.person}",
        amount=recibido,
        type="ingreso",
        account_id=destino.id,
        occurred_at=datetime.now(),
        fx_rate=fx.current_rate(db, destino.currency),
    )
    db.add(tx)
    db.flush()
    loan.status = "pagado"
    loan.paid_at = datetime.now()
    loan.received_amount = recibido
    loan.repayment_transaction_id = tx.id
    if datos.note:
        loan.note = datos.note.strip() or loan.note
    db.commit()
    return loan.to_dict(_loan_rate(db, loan))


@router.post("/loans/{loan_id}/reopen")
def reopen_loan(loan_id: int, db: Session = Depends(get_db)):
    """Se marcó pagado por error: se borra el ingreso y vuelve a prestado."""
    loan = db.get(Loan, loan_id)
    if not loan:
        raise HTTPException(404, "Préstamo no encontrado")
    if loan.status != "pagado":
        raise HTTPException(409, "Este préstamo no está pagado")
    if loan.repayment_transaction_id:
        tx = db.get(Transaction, loan.repayment_transaction_id)
        if tx:
            db.delete(tx)
    loan.status = "prestado"
    loan.paid_at = None
    loan.received_amount = None
    loan.repayment_transaction_id = None
    db.commit()
    return loan.to_dict(_loan_rate(db, loan))


@router.delete("/loans/{loan_id}")
def delete_loan(loan_id: int, db: Session = Depends(get_db)):
    """Borra el préstamo Y sus transacciones ligadas: deshacer un registro
    erróneo no debe dejar un egreso fantasma descuadrando la cuenta."""
    loan = db.get(Loan, loan_id)
    if not loan:
        raise HTTPException(404, "Préstamo no encontrado")
    for tx_id in (loan.transaction_id, loan.repayment_transaction_id):
        if tx_id:
            tx = db.get(Transaction, tx_id)
            if tx:
                db.delete(tx)
    db.delete(loan)
    db.commit()
    return {"deleted": True}


# ---------- pagos recurrentes (deudas y cobros a plazos) ----------

class RecurringPayload(BaseModel):
    name: str = Field(min_length=1)
    type: str = "egreso"  # egreso = deuda que pagas | ingreso = te abonan
    total_amount: float = Field(gt=0)
    installment_amount: float = Field(gt=0)
    installments_total: int = Field(gt=0)
    installments_paid: int = 0
    paid_amount: float = 0.0
    currency: str = BASE_CURRENCY
    frequency: str = "mensual"
    category_id: int | None = None
    account_id: int | None = None
    # de que negocio es la deuda y con que proveedor (para Pagos del negocio)
    context_id: int | None = None
    provider_id: int | None = None
    next_due: datetime | None = None


def _check_currency(code: str | None, db: Session) -> str:
    """Solo se aceptan divisas que ya existan en la pestaña Divisas, para no
    guardar montos que despues no se puedan convertir."""
    code = (code or BASE_CURRENCY).upper()
    if code != BASE_CURRENCY and not db.get(ExchangeRate, code):
        raise HTTPException(
            400, f"Primero agrega {code} en la pestaña Divisas para poder convertirla."
        )
    return code


def _charge_amount(item_currency: str, account: Account | None, amount: float, db: Session):
    """Convierte el monto pactado a la divisa de la cuenta que lo paga.
    Regresa (monto_en_la_cuenta, tipo_de_cambio_de_la_cuenta)."""
    acc_currency = account.currency if account else BASE_CURRENCY
    item_rate = fx.current_rate(db, item_currency)
    acc_rate = fx.current_rate(db, acc_currency) or 1.0
    return round(amount * item_rate / acc_rate, 2), acc_rate


class CobroPayload(BaseModel):
    """Lo que de verdad se cobro, cuando no coincide con la conversion nuestra.

    PayPal convierte con su propio tipo de cambio —en la practica cerca de un
    6% arriba del mercado— y no lo desglosa como comision: lo mete dentro de la
    tasa. Como el recibo si trae el monto exacto, aqui se captura tal cual en
    vez de estimarlo.
    """

    # monto ya convertido, en la divisa de la cuenta que paga
    charged_amount: float | None = Field(default=None, gt=0)
    via_paypal: bool = False


def _monto_final(datos: "CobroPayload | None", item_currency: str,
                 account: Account | None, amount: float, db: Session):
    """El monto que se le carga a la cuenta y con que tipo de cambio.

    Si viene charged_amount se respeta tal cual (es el del recibo) y el tipo
    de cambio se deduce; si no, se convierte con el del mercado como siempre.
    """
    if datos and datos.charged_amount:
        acc_rate = fx.current_rate(db, account.currency if account else BASE_CURRENCY) or 1.0
        return round(datos.charged_amount, 2), acc_rate, bool(datos.via_paypal)
    monto, acc_rate = _charge_amount(item_currency, account, amount, db)
    return monto, acc_rate, bool(datos.via_paypal) if datos else False


@router.get("/recurring")
def list_recurring(context_id: int | None = None, db: Session = Depends(get_db)):
    rates = {r.code: r.rate_to_mxn for r in db.query(ExchangeRate).all()}
    q = db.query(RecurringPayment)
    if context_id:
        q = q.filter(RecurringPayment.context_id == context_id)
    items = q.order_by(RecurringPayment.next_due).all()
    return [r.to_dict(rates.get(r.currency or BASE_CURRENCY, 1.0)) for r in items]


@router.post("/recurring", status_code=201)
def create_recurring(payload: RecurringPayload, db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["currency"] = _check_currency(data.get("currency"), db)
    item = RecurringPayment(**data)
    db.add(item)
    db.commit()
    return item.to_dict(fx.current_rate(db, item.currency))


@router.put("/recurring/{item_id}")
def update_recurring(item_id: int, payload: RecurringPayload, db: Session = Depends(get_db)):
    item = db.get(RecurringPayment, item_id)
    if not item:
        raise HTTPException(404, "Pago recurrente no encontrado")
    data = payload.model_dump()
    data["currency"] = _check_currency(data.get("currency"), db)
    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    return item.to_dict(fx.current_rate(db, item.currency))


@router.post("/recurring/{item_id}/pay")
def pay_recurring(item_id: int, payload: CobroPayload | None = None,
                  db: Session = Depends(get_db)):
    """Registra una cuota: crea el movimiento, avanza contador y siguiente fecha.

    Segun el tipo, el movimiento es un egreso (una deuda que pagas) o un
    ingreso (dinero que te abonan a plazos).
    """
    item = db.get(RecurringPayment, item_id)
    if not item:
        raise HTTPException(404, "Pago recurrente no encontrado")
    es_ingreso = (item.type or "egreso") == "ingreso"
    if item.installments_paid >= item.installments_total:
        raise HTTPException(409, "Este cobro ya terminó" if es_ingreso else "Esta deuda ya está liquidada")
    if item.account_id:
        account = db.get(Account, item.account_id)
        currency = item.currency or BASE_CURRENCY
        amount, acc_rate, paypal = _monto_final(
            payload, currency, account, item.installment_amount, db
        )
        etiqueta = "Cobro" if es_ingreso else "Pago"
        description = f"{etiqueta} {item.installments_paid + 1}/{item.installments_total}: {item.name}"
        if account and currency != account.currency:
            description += f" ({item.installment_amount:g} {currency})"
        db.add(
            Transaction(
                description=description,
                amount=amount,
                type="ingreso" if es_ingreso else "egreso",
                category_id=item.category_id,
                account_id=item.account_id,
                # el movimiento hereda a quien pertenece la deuda, para que
                # aparezca en el CRM y en Pagos del negocio sin re-etiquetar
                context_id=item.context_id,
                provider_id=item.provider_id,
                occurred_at=datetime.now(),
                fx_rate=acc_rate,
                via_paypal=paypal,
            )
        )
    item.installments_paid += 1
    item.paid_amount = round(item.paid_amount + item.installment_amount, 2)
    if item.next_due and item.installments_paid < item.installments_total:
        item.next_due = _add_months(item.next_due, PERIOD_MONTHS.get(item.frequency, 1))
    db.commit()
    return item.to_dict(fx.current_rate(db, item.currency))


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
    currency: str = BASE_CURRENCY
    period: str = "mensual"
    category_id: int | None = None
    account_id: int | None = None
    context_id: int | None = None
    provider_id: int | None = None
    next_due: datetime | None = None


@router.get("/subscriptions")
def list_subscriptions(db: Session = Depends(get_db)):
    rates = {r.code: r.rate_to_mxn for r in db.query(ExchangeRate).all()}
    items = db.query(Subscription).order_by(Subscription.next_due).all()
    return [s.to_dict(rates.get(s.currency or BASE_CURRENCY, 1.0)) for s in items]


@router.post("/subscriptions", status_code=201)
def create_subscription(payload: SubscriptionPayload, db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["currency"] = _check_currency(data.get("currency"), db)
    item = Subscription(**data)
    db.add(item)
    db.commit()
    return item.to_dict(fx.current_rate(db, item.currency))


@router.put("/subscriptions/{item_id}")
def update_subscription(item_id: int, payload: SubscriptionPayload, db: Session = Depends(get_db)):
    item = db.get(Subscription, item_id)
    if not item:
        raise HTTPException(404, "Suscripción no encontrada")
    data = payload.model_dump()
    data["currency"] = _check_currency(data.get("currency"), db)
    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    return item.to_dict(fx.current_rate(db, item.currency))


@router.post("/subscriptions/{item_id}/pay")
def pay_subscription(item_id: int, payload: CobroPayload | None = None,
                     db: Session = Depends(get_db)):
    """Registra el cobro del periodo: crea el egreso y avanza el siguiente pago."""
    item = db.get(Subscription, item_id)
    if not item:
        raise HTTPException(404, "Suscripción no encontrada")
    if item.account_id:
        account = db.get(Account, item.account_id)
        currency = item.currency or BASE_CURRENCY
        amount, acc_rate, paypal = _monto_final(payload, currency, account, item.amount, db)
        description = f"Suscripción: {item.name}"
        if account and currency != account.currency:
            description += f" ({item.amount:g} {currency})"
        db.add(
            Transaction(
                description=description,
                amount=amount,
                type="egreso",
                category_id=item.category_id,
                account_id=item.account_id,
                context_id=item.context_id,
                provider_id=item.provider_id,
                occurred_at=datetime.now(),
                fx_rate=acc_rate,
                via_paypal=paypal,
            )
        )
    if item.next_due:
        item.next_due = _add_months(item.next_due, PERIOD_MONTHS.get(item.period, 1))
    db.commit()
    return item.to_dict(fx.current_rate(db, item.currency))


@router.delete("/subscriptions/{item_id}")
def delete_subscription(item_id: int, db: Session = Depends(get_db)):
    item = db.get(Subscription, item_id)
    if not item:
        raise HTTPException(404, "Suscripción no encontrada")
    db.delete(item)
    db.commit()
    return {"deleted": True}


# ---------- programados ----------

class ScheduledPayload(BaseModel):
    description: str = Field(min_length=1)
    amount: float = Field(gt=0)
    currency: str = BASE_CURRENCY
    type: str
    category_id: int | None = None
    account_id: int
    to_account_id: int | None = None
    to_goal_id: int | None = None
    context_id: int | None = None
    provider_id: int | None = None
    scheduled_for: datetime
    attachment_path: str | None = None
    attachment_name: str | None = None


class ConfirmPayload(BaseModel):
    """Todo opcional: por defecto se concreta con lo que se programo."""

    amount: float | None = Field(default=None, gt=0)
    occurred_at: datetime | None = None
    attachment_path: str | None = None
    attachment_name: str | None = None
    # lo que de verdad se cargo a la cuenta, si el tipo de cambio fue otro
    charged_amount: float | None = Field(default=None, gt=0)
    via_paypal: bool = False


class PostponePayload(BaseModel):
    scheduled_for: datetime
    note: str | None = None


class NotePayload(BaseModel):
    note: str | None = None


def _validate_scheduled(payload: ScheduledPayload, db: Session) -> None:
    if payload.type not in ("ingreso", "egreso", "transferencia"):
        raise HTTPException(400, "Tipo inválido")
    if not db.get(Account, payload.account_id):
        raise HTTPException(400, "La cuenta no existe")
    if payload.type == "transferencia":
        if not payload.to_account_id and not payload.to_goal_id:
            raise HTTPException(400, "La transferencia necesita cuenta o meta destino")
        if payload.to_account_id == payload.account_id:
            raise HTTPException(400, "No puedes transferir a la misma cuenta")


def _solo_pendiente(item: ScheduledTransaction, accion: str) -> None:
    if item.status != "pendiente":
        estado = "ya se concretó" if item.status == "concretado" else "está cancelado"
        raise HTTPException(409, f"No se puede {accion}: el programado {estado}.")


@router.get("/scheduled")
def list_scheduled(
    status: str = "pendiente",
    type: str | None = None,
    account_id: int | None = None,
    context_id: int | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    """status=all trae también el historial de concretados y cancelados."""
    q = db.query(ScheduledTransaction)
    if status != "all":
        q = q.filter(ScheduledTransaction.status == status)
    if type:
        q = q.filter(ScheduledTransaction.type == type)
    if account_id:
        q = q.filter(ScheduledTransaction.account_id == account_id)
    if context_id:
        q = q.filter(ScheduledTransaction.context_id == context_id)
    # los pendientes se leen de lo mas proximo a lo mas lejano; el historial al reves
    orden = (
        ScheduledTransaction.scheduled_for.desc()
        if status in ("concretado", "cancelado")
        else ScheduledTransaction.scheduled_for.asc()
    )
    items = q.order_by(orden).limit(min(limit, 1000)).all()
    return [i.to_dict(fx.current_rate(db, i.currency)) for i in items]


@router.post("/scheduled", status_code=201)
def create_scheduled(payload: ScheduledPayload, db: Session = Depends(get_db)):
    _validate_scheduled(payload, db)
    data = payload.model_dump()
    data["currency"] = _check_currency(data.get("currency"), db)
    item = ScheduledTransaction(**data)
    db.add(item)
    db.commit()
    return item.to_dict(fx.current_rate(db, item.currency))


@router.put("/scheduled/{item_id}")
def update_scheduled(item_id: int, payload: ScheduledPayload, db: Session = Depends(get_db)):
    item = db.get(ScheduledTransaction, item_id)
    if not item:
        raise HTTPException(404, "Programado no encontrado")
    _solo_pendiente(item, "editar")
    _validate_scheduled(payload, db)
    data = payload.model_dump()
    data["currency"] = _check_currency(data.get("currency"), db)
    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    return item.to_dict(fx.current_rate(db, item.currency))


@router.post("/scheduled/{item_id}/confirm")
def confirm_scheduled(item_id: int, payload: ConfirmPayload | None = None,
                      db: Session = Depends(get_db)):
    """Lo programado ocurrio: nace la Transaction real y la fila queda cerrada."""
    item = db.get(ScheduledTransaction, item_id)
    if not item:
        raise HTTPException(404, "Programado no encontrado")
    _solo_pendiente(item, "concretar")
    datos = payload or ConfirmPayload()

    # revalidar en vez de copiar a ciegas: los destinos son ondelete=SET NULL,
    # asi que pudieron quedar vacios despues de programarlo
    account = db.get(Account, item.account_id)
    if not account:
        raise HTTPException(400, "La cuenta de este programado ya no existe.")
    if item.type == "transferencia":
        if item.to_account_id and not db.get(Account, item.to_account_id):
            raise HTTPException(400, "La cuenta destino ya no existe. Edítalo antes de concretarlo.")
        if item.to_goal_id and not db.get(Goal, item.to_goal_id):
            raise HTTPException(400, "La meta destino ya no existe. Edítalo antes de concretarlo.")
        if not item.to_account_id and not item.to_goal_id:
            raise HTTPException(400, "Este programado se quedó sin destino. Edítalo antes de concretarlo.")

    ahora = datetime.now()
    # si se confirma tarde, el dinero se movio el dia previsto: anclarlo ahi
    # mantiene honestos los resumenes por mes
    cuando = datos.occurred_at or (item.scheduled_for if item.scheduled_for <= ahora else ahora)
    if cuando > ahora:
        raise HTTPException(
            400,
            "No se puede concretar con fecha futura: eso alteraría los saldos de hoy. "
            "Si aún no ocurre, aplázalo.",
        )

    monto_pactado = datos.amount if datos.amount is not None else item.amount
    # el tipo de cambio se congela AHORA, no cuando se programo. Ojo: si se
    # confirma tarde se congela la tasa de hoy, porque exchange_rates solo
    # guarda el valor vigente y no el historico. Si el cobro paso por PayPal,
    # el monto real viene en charged_amount y manda sobre la conversion.
    monto, acc_rate, paypal = _monto_final(
        CobroPayload(charged_amount=datos.charged_amount, via_paypal=datos.via_paypal),
        item.currency or BASE_CURRENCY, account, monto_pactado, db,
    )

    tx = Transaction(
        description=item.description,
        amount=monto,
        type=item.type,
        category_id=item.category_id,
        account_id=item.account_id,
        to_account_id=item.to_account_id,
        to_goal_id=item.to_goal_id,
        context_id=item.context_id,
        provider_id=item.provider_id,
        occurred_at=cuando,
        fx_rate=acc_rate,
        via_paypal=paypal,
        attachment_path=datos.attachment_path or item.attachment_path,
        attachment_name=datos.attachment_name or item.attachment_name,
    )
    db.add(tx)
    db.flush()  # necesitamos el id antes de cerrar la fila programada

    item.status = "concretado"
    item.transaction_id = tx.id
    item.actual_amount = monto_pactado
    item.resolved_at = ahora
    db.commit()
    return {"scheduled": item.to_dict(fx.current_rate(db, item.currency)), "transaction": tx.to_dict()}


@router.post("/scheduled/{item_id}/postpone")
def postpone_scheduled(item_id: int, payload: PostponePayload, db: Session = Depends(get_db)):
    item = db.get(ScheduledTransaction, item_id)
    if not item:
        raise HTTPException(404, "Programado no encontrado")
    _solo_pendiente(item, "aplazar")
    if item.original_scheduled_for is None:
        item.original_scheduled_for = item.scheduled_for
    item.scheduled_for = payload.scheduled_for
    item.postponed_count = (item.postponed_count or 0) + 1
    if payload.note:
        item.note = payload.note
    db.commit()
    return item.to_dict(fx.current_rate(db, item.currency))


@router.post("/scheduled/{item_id}/cancel")
def cancel_scheduled(item_id: int, payload: NotePayload | None = None,
                     db: Session = Depends(get_db)):
    """No se concreto. No se borra: queda en el historial."""
    item = db.get(ScheduledTransaction, item_id)
    if not item:
        raise HTTPException(404, "Programado no encontrado")
    if item.status == "concretado":
        raise HTTPException(409, "Ya se concretó. Borra la transacción si fue un error.")
    item.status = "cancelado"
    item.resolved_at = datetime.now()
    if payload and payload.note:
        item.note = payload.note
    db.commit()
    return item.to_dict(fx.current_rate(db, item.currency))


@router.post("/scheduled/{item_id}/reopen")
def reopen_scheduled(item_id: int, db: Session = Depends(get_db)):
    """Vuelve a pendiente. Tambien rescata las filas que quedaron marcadas como
    concretadas pero cuya transaccion se borro a mano."""
    item = db.get(ScheduledTransaction, item_id)
    if not item:
        raise HTTPException(404, "Programado no encontrado")
    if item.status == "concretado" and item.transaction_id is not None:
        raise HTTPException(409, "Primero borra la transacción que generó.")
    item.status = "pendiente"
    item.transaction_id = None
    item.actual_amount = None
    item.resolved_at = None
    db.commit()
    return item.to_dict(fx.current_rate(db, item.currency))


@router.delete("/scheduled/{item_id}")
def delete_scheduled(item_id: int, db: Session = Depends(get_db)):
    """Borra el plan, nunca la transaccion real que haya generado."""
    item = db.get(ScheduledTransaction, item_id)
    if not item:
        raise HTTPException(404, "Programado no encontrado")
    tenia_tx = item.transaction_id is not None
    db.delete(item)
    db.commit()
    return {"deleted": True, "transaction_kept": tenia_tx}


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


# ---------- presupuesto ----------

MONTHS_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


def _months_left(deadline: datetime) -> int:
    """Meses que faltan para una fecha. Minimo 1: si ya paso o es este mes,
    lo que falte se necesita ahora."""
    days = (deadline.date() - datetime.now().date()).days
    return max(1, math.ceil(days / 30.44))


def _budget_data(db: Session) -> dict:
    """Cuanto necesitas al mes para cubrir todo lo que ya te comprometiste."""
    rates = {r.code: r.rate_to_mxn for r in db.query(ExchangeRate).all()}
    accounts = {a.id: a for a in db.query(Account).all()}

    def mxn(amount: float, currency: str | None) -> float:
        return round(amount * rates.get(currency or BASE_CURRENCY, 1.0), 2)

    def account_name(account_id: int | None) -> str | None:
        account = accounts.get(account_id) if account_id else None
        return account.name if account else None

    commitments: list[dict] = []

    for s in db.query(Subscription).order_by(Subscription.name).all():
        per_month = s.amount / PERIOD_MONTHS.get(s.period, 1)
        commitments.append({
            "kind": "Suscripción",
            "name": s.name,
            "amount": s.amount,
            "currency": s.currency or BASE_CURRENCY,
            "period": s.period,
            "monthly_mxn": mxn(per_month, s.currency),
            "account": account_name(s.account_id),
            "next_due": s.next_due.isoformat() if s.next_due else None,
            "note": None,
        })

    # los recurrentes de tipo ingreso no son un compromiso mensual sino lo
    # contrario: se suman al ingreso esperado de su cuenta
    ingresos_recurrentes: dict[int, float] = {}

    for r in db.query(RecurringPayment).order_by(RecurringPayment.name).all():
        liquidada = r.installments_paid >= r.installments_total
        per_month = 0.0 if liquidada else r.installment_amount / PERIOD_MONTHS.get(r.frequency, 1)
        if (r.type or "egreso") == "ingreso":
            # sin cuenta no hay donde sumarlo, igual que /pay no crea movimiento
            if r.account_id and not liquidada:
                ingresos_recurrentes[r.account_id] = (
                    ingresos_recurrentes.get(r.account_id, 0.0) + mxn(per_month, r.currency)
                )
            continue
        commitments.append({
            "kind": "Pago recurrente",
            "name": r.name,
            "amount": r.installment_amount,
            "currency": r.currency or BASE_CURRENCY,
            "period": r.frequency,
            "monthly_mxn": mxn(per_month, r.currency),
            "account": account_name(r.account_id),
            "next_due": r.next_due.isoformat() if r.next_due else None,
            "note": "liquidada" if liquidada else f"{r.installments_paid}/{r.installments_total} cuotas",
        })

    # las metas ya se manejan en MXN, igual que su monto objetivo
    saved = _goal_saved(db)
    for g in db.query(Goal).order_by(Goal.name).all():
        falta = max(0.0, g.target_amount - saved.get(g.id, 0.0))
        if g.deadline and falta > 0:
            per_month = round(falta / _months_left(g.deadline), 2)
            note = f"faltan {fmt_money_note(falta)} para la fecha límite"
        elif falta <= 0:
            per_month, note = 0.0, "meta alcanzada"
        else:
            per_month, note = 0.0, "sin fecha límite, no se presupuesta"
        commitments.append({
            "kind": "Meta",
            "name": g.name,
            "amount": g.target_amount,
            "currency": BASE_CURRENCY,
            "period": "—",
            "monthly_mxn": per_month,
            "account": None,
            "next_due": g.deadline.isoformat() if g.deadline else None,
            "note": note,
        })

    # ingresos reales del mes en curso
    start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    real = dict(
        db.query(
            Transaction.account_id,
            func.sum(Transaction.amount * func.coalesce(Transaction.fx_rate, 1.0)),
        )
        .filter(
            Transaction.type == "ingreso",
            Transaction.occurred_at >= start,
            Transaction.occurred_at < _add_months(start, 1),
        )
        .group_by(Transaction.account_id)
        .all()
    )

    income = [
        {
            "account": a.name,
            "currency": a.currency,
            "expected": a.expected_income or 0.0,
            # lo capturado a mano en la cuenta mas lo que aportan los cobros
            # recurrentes que caen en ella
            "expected_mxn": round(
                mxn(a.expected_income or 0.0, a.currency) + ingresos_recurrentes.get(a.id, 0.0), 2
            ),
            "recurring_mxn": round(ingresos_recurrentes.get(a.id, 0.0), 2),
            "actual_mxn": round(real.get(a.id, 0.0), 2),
        }
        for a in sorted(accounts.values(), key=lambda x: (x.sort_order, x.name))
    ]

    def suma(kind: str) -> float:
        return round(sum(c["monthly_mxn"] for c in commitments if c["kind"] == kind), 2)

    total_commitments = round(sum(c["monthly_mxn"] for c in commitments), 2)
    total_expected = round(sum(i["expected_mxn"] for i in income), 2)
    total_actual = round(sum(i["actual_mxn"] for i in income), 2)
    now = datetime.now()

    return {
        "month_label": f"{MONTHS_ES[now.month - 1]} {now.year}",
        "commitments": commitments,
        "income": income,
        "totals": {
            "subscriptions": suma("Suscripción"),
            "recurring": suma("Pago recurrente"),
            "goals": suma("Meta"),
            "commitments": total_commitments,
            "expected_income": total_expected,
            "actual_income": total_actual,
            "balance_expected": round(total_expected - total_commitments, 2),
            "balance_actual": round(total_actual - total_commitments, 2),
        },
    }


def fmt_money_note(value: float) -> str:
    return f"${value:,.2f}"


@router.get("/budget")
def budget(db: Session = Depends(get_db)):
    return _budget_data(db)


@router.get("/budget/export.xlsx")
def export_budget(db: Session = Depends(get_db)):
    data = _budget_data(db)
    content = build_budget_xlsx(data)
    stamp = datetime.now().strftime("%Y-%m")
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="presupuesto-{stamp}.xlsx"'},
    )


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

    mes = _mes_de(Transaction.occurred_at)
    qm = db.query(
        mes,
        Transaction.type,
        func.sum(Transaction.amount * func.coalesce(Transaction.fx_rate, 1.0)),
    ).filter(Transaction.type.in_(["ingreso", "egreso"]))
    if context_id:
        qm = qm.filter(Transaction.context_id == context_id)
    by_month: dict = {}
    for month_key, tx_type, total in qm.group_by(mes, Transaction.type):
        entry = by_month.setdefault(month_key, {"ingresos": 0.0, "egresos": 0.0})
        entry["ingresos" if tx_type == "ingreso" else "egresos"] += total

    start_today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    qt = db.query(
        Transaction.type,
        func.sum(Transaction.amount * func.coalesce(Transaction.fx_rate, 1.0)),
    ).filter(
        Transaction.type.in_(["ingreso", "egreso"]),
        Transaction.occurred_at >= start_today,
        # con cota superior: sin ella, cualquier movimiento con fecha futura
        # se contaria como si hubiera pasado hoy
        Transaction.occurred_at < start_today + timedelta(days=1),
    )
    if context_id:
        qt = qt.filter(Transaction.context_id == context_id)
    today_totals = {"ingresos": 0.0, "egresos": 0.0}
    for tx_type, total in qt.group_by(Transaction.type):
        today_totals["ingresos" if tx_type == "ingreso" else "egresos"] = total

    # para que el Resumen sepa si hay algo que atender sin pedir otra ruta
    pendientes = db.query(ScheduledTransaction).filter(
        ScheduledTransaction.status == "pendiente"
    ).all()
    hoy = datetime.now().date()
    programados = {
        "pendientes": len(pendientes),
        "vencidos": sum(1 for p in pendientes if p.scheduled_for.date() < hoy),
        "hoy": sum(1 for p in pendientes if p.scheduled_for.date() == hoy),
    }

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
        "programados": programados,
    }
