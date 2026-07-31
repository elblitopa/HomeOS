from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base

# periodos: mensual | bimestral | trimestral | semestral | anual
PERIOD_MONTHS = {"mensual": 1, "bimestral": 2, "trimestral": 3, "semestral": 6, "anual": 12}

# divisa base de todo el panel
BASE_CURRENCY = "MXN"


class ExchangeRate(Base):
    """Tipo de cambio de una divisa hacia MXN."""

    __tablename__ = "exchange_rates"

    code: Mapped[str] = mapped_column(String, primary_key=True)  # USD, EUR, BTC…
    rate_to_mxn: Mapped[float] = mapped_column(Float, default=1.0)
    # manual = el usuario fijo el tipo de cambio; la actualizacion automatica lo respeta
    manual: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String, default="auto")
    kind: Mapped[str] = mapped_column(String, default="fiat")  # fiat | cripto
    # id que usa la API de cripto (CoinGecko): BTC -> "bitcoin"
    api_id: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "rate_to_mxn": self.rate_to_mxn,
            "manual": bool(self.manual),
            "source": self.source,
            "kind": self.kind or "fiat",
            "api_id": self.api_id,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Account(Base):
    """Cuenta: efectivo, débito, crédito, ingreso extra…"""

    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[str] = mapped_column(String, default="efectivo")  # efectivo|debito|credito|ingreso_extra|otro
    scope: Mapped[str] = mapped_column(String, default="personal")  # personal|negocio
    bank: Mapped[str | None] = mapped_column(String, nullable=True)
    currency: Mapped[str] = mapped_column(String, default="MXN")
    initial_balance: Mapped[float] = mapped_column(Float, default=0.0)
    # cuanto esperas que entre a esta cuenta cada mes (sueldo, renta, etc.)
    expected_income: Mapped[float] = mapped_column(Float, default=0.0)
    color: Mapped[str] = mapped_column(String, default="#2383e2")
    banner_path: Mapped[str | None] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # la que sale preseleccionada al registrar un movimiento; solo puede
    # haber una, el router se encarga de apagar las demas
    is_default: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "scope": self.scope,
            "bank": self.bank,
            "currency": self.currency,
            "initial_balance": self.initial_balance,
            "expected_income": self.expected_income or 0.0,
            "color": self.color,
            "banner_path": self.banner_path,
            "sort_order": self.sort_order,
            "is_default": bool(self.is_default),
        }


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    icon: Mapped[str] = mapped_column(String, default="🏷️")
    is_default: Mapped[int] = mapped_column(Integer, default=0)

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "icon": self.icon, "is_default": bool(self.is_default)}


DEFAULT_CATEGORIES = [
    ("Comida", "🍽️"),
    ("Transporte", "🚗"),
    ("Compras", "🛍️"),
    ("Entretenimiento", "🎬"),
    ("Negocios", "💼"),
    ("Educación", "📚"),
    ("Salud", "🏥"),
    ("Regalos", "🎁"),
    ("Personal", "👤"),
    ("Otros", "📦"),
]


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    description: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)  # siempre positivo
    type: Mapped[str] = mapped_column(String, nullable=False)  # ingreso|egreso|transferencia
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    # destino de transferencias: otra cuenta o una meta
    to_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    to_goal_id: Mapped[int | None] = mapped_column(
        ForeignKey("goals.id", ondelete="SET NULL"), nullable=True
    )
    context_id: Mapped[int | None] = mapped_column(
        ForeignKey("contexts.id", ondelete="SET NULL"), nullable=True
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    # tipo de cambio a MXN vigente cuando ocurrio (1.0 si la cuenta ya es MXN);
    # se congela para que el historial no cambie si el dolar sube o baja despues
    fx_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    # el cobro paso por PayPal, que convierte con su propio tipo de cambio
    # (bastante peor que el del mercado) en vez del que tenemos en Divisas
    via_paypal: Mapped[bool] = mapped_column(Boolean, default=False)
    attachment_path: Mapped[str | None] = mapped_column(String, nullable=True)
    attachment_name: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "description": self.description,
            "amount": self.amount,
            "type": self.type,
            "category_id": self.category_id,
            "account_id": self.account_id,
            "to_account_id": self.to_account_id,
            "to_goal_id": self.to_goal_id,
            "context_id": self.context_id,
            "occurred_at": self.occurred_at.isoformat(),
            "fx_rate": self.fx_rate,
            "amount_mxn": round(self.amount * (self.fx_rate or 1.0), 2),
            "via_paypal": bool(self.via_paypal),
            "attachment_path": self.attachment_path,
            "attachment_name": self.attachment_name,
        }


class Goal(Base):
    """Meta de ahorro. Lo guardado se calcula con transferencias hacia la meta."""

    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    target_amount: Mapped[float] = mapped_column(Float, nullable=False)
    # fecha limite opcional para alcanzar la meta
    deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    banner_path: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self, saved: float = 0.0) -> dict:
        days_left = None
        if self.deadline:
            days_left = (self.deadline.date() - datetime.now().date()).days
        return {
            "id": self.id,
            "name": self.name,
            "target_amount": self.target_amount,
            "deadline": self.deadline.isoformat() if self.deadline else None,
            "days_left": days_left,
            "banner_path": self.banner_path,
            "saved_amount": saved,
            "progress": min(1.0, saved / self.target_amount) if self.target_amount else 0,
        }


class RecurringPayment(Base):
    """Deuda / préstamo con cuotas."""

    __tablename__ = "recurring_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # egreso = deuda que pagas; ingreso = dinero que te entra a plazos
    # (un sueldo, alguien que te abona). Por defecto egreso, que es como
    # nacio esta tabla.
    type: Mapped[str] = mapped_column(String, default="egreso")
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    installment_amount: Mapped[float] = mapped_column(Float, nullable=False)
    # divisa en la que esta pactada la deuda (puede no ser la de la cuenta)
    currency: Mapped[str] = mapped_column(String, default=BASE_CURRENCY)
    installments_total: Mapped[int] = mapped_column(Integer, nullable=False)
    installments_paid: Mapped[int] = mapped_column(Integer, default=0)
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0)
    frequency: Mapped[str] = mapped_column(String, default="mensual")
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    next_due: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self, rate: float = 1.0) -> dict:
        pending = max(0.0, self.total_amount - self.paid_amount)
        days_left = None
        if self.next_due:
            days_left = (self.next_due.date() - datetime.now().date()).days
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type or "egreso",
            "currency": self.currency or BASE_CURRENCY,
            "installment_amount_mxn": round(self.installment_amount * rate, 2),
            "total_amount": self.total_amount,
            "installment_amount": self.installment_amount,
            "installments_total": self.installments_total,
            "installments_paid": self.installments_paid,
            "paid_amount": self.paid_amount,
            "pending_amount": pending,
            "frequency": self.frequency,
            "category_id": self.category_id,
            "account_id": self.account_id,
            "next_due": self.next_due.isoformat() if self.next_due else None,
            "days_left": days_left,
            "progress": min(1.0, self.paid_amount / self.total_amount) if self.total_amount else 0,
            "done": self.installments_paid >= self.installments_total,
        }


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    # divisa del cobro (ej. Netflix en USD cargado a una tarjeta en MXN)
    currency: Mapped[str] = mapped_column(String, default=BASE_CURRENCY)
    period: Mapped[str] = mapped_column(String, default="mensual")
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    next_due: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self, rate: float = 1.0) -> dict:
        days_left = None
        if self.next_due:
            days_left = (self.next_due.date() - datetime.now().date()).days
        return {
            "id": self.id,
            "name": self.name,
            "amount": self.amount,
            "currency": self.currency or BASE_CURRENCY,
            "amount_mxn": round(self.amount * rate, 2),
            "period": self.period,
            "category_id": self.category_id,
            "account_id": self.account_id,
            "next_due": self.next_due.isoformat() if self.next_due else None,
            "days_left": days_left,
        }


class ScheduledTransaction(Base):
    """Ingreso o egreso que todavia no ocurre pero se sabe que llegara.

    Vive en su propia tabla a proposito: los saldos de _account_balances suman
    todas las filas de transactions sin filtrar, asi que un movimiento futuro
    guardado ahi alteraria el saldo desde el momento de anotarlo. Aqui es un
    plan, y al concretarse nace la Transaction real — el mismo patron que ya
    usan los pagos recurrentes y las suscripciones con su endpoint /pay.
    """

    __tablename__ = "scheduled_transactions"
    # candado de idempotencia: una fila programada no puede haber generado
    # dos transacciones
    __table_args__ = (UniqueConstraint("transaction_id", name="uq_scheduled_tx"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    description: Mapped[str] = mapped_column(String, nullable=False)
    # monto estimado; el real puede diferir y se guarda en actual_amount
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    # divisa pactada, que puede no ser la de la cuenta (igual que Subscription)
    currency: Mapped[str] = mapped_column(String, default=BASE_CURRENCY)
    type: Mapped[str] = mapped_column(String, nullable=False)  # ingreso|egreso|transferencia
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    to_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    to_goal_id: Mapped[int | None] = mapped_column(
        ForeignKey("goals.id", ondelete="SET NULL"), nullable=True
    )
    context_id: Mapped[int | None] = mapped_column(
        ForeignKey("contexts.id", ondelete="SET NULL"), nullable=True
    )

    scheduled_for: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    # aplazar no es un estado: mueve la fecha y sigue pendiente
    status: Mapped[str] = mapped_column(String, default="pendiente")  # pendiente|concretado|cancelado
    original_scheduled_for: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    postponed_count: Mapped[int] = mapped_column(Integer, default=0)

    transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
    actual_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    attachment_path: Mapped[str | None] = mapped_column(String, nullable=True)
    attachment_name: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self, rate: float = 1.0) -> dict:
        days_left = (self.scheduled_for.date() - datetime.now().date()).days
        pendiente = self.status == "pendiente"
        return {
            "id": self.id,
            "description": self.description,
            "amount": self.amount,
            "currency": self.currency or BASE_CURRENCY,
            # con el tipo de cambio de hoy: es una estimacion, no un valor
            # congelado como el fx_rate de una transaccion ya ocurrida
            "amount_mxn_estimado": round(self.amount * rate, 2),
            "actual_amount": self.actual_amount,
            "type": self.type,
            "category_id": self.category_id,
            "account_id": self.account_id,
            "to_account_id": self.to_account_id,
            "to_goal_id": self.to_goal_id,
            "context_id": self.context_id,
            "scheduled_for": self.scheduled_for.isoformat(),
            "status": self.status,
            "days_left": days_left,
            "overdue": pendiente and days_left < 0,
            "due_today": pendiente and days_left == 0,
            "original_scheduled_for": (
                self.original_scheduled_for.isoformat() if self.original_scheduled_for else None
            ),
            "postponed_count": self.postponed_count or 0,
            "transaction_id": self.transaction_id,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "note": self.note,
            "attachment_path": self.attachment_path,
            "attachment_name": self.attachment_name,
        }
