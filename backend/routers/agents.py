"""Estado de los agentes para el USUARIO (/api/agents/*).

Protegido por la cookie de sesión como todo /api/* (el middleware de cloud NO
excluye este prefijo — solo excluye /api/agent-bridge/, que tiene su token).
Aquí nunca viaja token_hash ni nada interno.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Agent, AgentCommand
from backend.services.agent_queue import expirar_comandos

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("")
def list_agents(db: Session = Depends(get_db)):
    """Las máquinas registradas y si están en línea (derivado de last_seen)."""
    return [a.to_dict() for a in db.query(Agent).order_by(Agent.device_id).all()]


@router.get("/commands/{command_id}")
def command_status(command_id: int, db: Session = Depends(get_db)):
    """Estado de un comando encolado; el frontend lo consulta tras un 202."""
    expirar_comandos(db)
    cmd = db.get(AgentCommand, command_id)
    if not cmd:
        raise HTTPException(404, "Comando no encontrado")
    return cmd.to_dict()
