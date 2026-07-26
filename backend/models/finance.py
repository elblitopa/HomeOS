from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
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
    color: Mapped[str] = mapped_column(String, default="#2383e2")
    banner_path: Mapped[str | None] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
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
            "color": self.color,
            "banner_path": self.banner_path,
            "sort_order": self.sort_order,
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
            "saved_amount": saved,
            "progress": min(1.0, saved / self.target_amount) if self.target_amount else 0,
        }


class RecurringPayment(Base):
    """Deuda / préstamo con cuotas."""

    __tablename__ = "recurring_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    installment_amount: Mapped[float] = mapped_column(Float, nullable=False)
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

    def to_dict(self) -> dict:
        pending = max(0.0, self.total_amount - self.paid_amount)
        days_left = None
        if self.next_due:
            days_left = (self.next_due.date() - datetime.now().date()).days
        return {
            "id": self.id,
            "name": self.name,
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
    period: Mapped[str] = mapped_column(String, default="mensual")
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    next_due: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict:
        days_left = None
        if self.next_due:
            days_left = (self.next_due.date() - datetime.now().date()).days
        return {
            "id": self.id,
            "name": self.name,
            "amount": self.amount,
            "period": self.period,
            "category_id": self.category_id,
            "account_id": self.account_id,
            "next_due": self.next_due.isoformat() if self.next_due else None,
            "days_left": days_left,
        }
