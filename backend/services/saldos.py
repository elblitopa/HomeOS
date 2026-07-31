"""Agregaciones sobre las transacciones que necesitan varios modulos.

Viven aqui y no en el router de finanzas para que el calendario pueda usarlas
sin importar un router desde otro router.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models import Transaction


def goal_saved(db: Session) -> dict[int, float]:
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
