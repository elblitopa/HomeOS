"""Estado de los agentes para el USUARIO (/api/agents/*).

Protegido por la cookie de sesión como todo /api/* (el middleware de cloud NO
excluye este prefijo — solo excluye /api/agent-bridge/, que tiene su token).
Aquí nunca viaja token_hash ni nada interno.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Agent, AgentCommand
from backend.routers.agent_bridge import hash_token
from backend.services.agent_queue import expirar_comandos

router = APIRouter(prefix="/api/agents", tags=["agents"])

# los devices que existen; hoy una sola PC. Un device_id fuera de esta lista
# no puede obtener token: nada de registrar máquinas nuevas por accidente.
KNOWN_DEVICES = {"pc-principal": "PC Principal"}


@router.get("")
def list_agents(db: Session = Depends(get_db)):
    """Las máquinas registradas y si están en línea (derivado de last_seen)."""
    return [a.to_dict() for a in db.query(Agent).order_by(Agent.device_id).all()]


@router.post("/{device_id}/token")
def generate_token(device_id: str, db: Session = Depends(get_db)):
    """Genera (o regenera) el token del agente. Es el bootstrap de la PC.

    - El token viaja en esta respuesta UNA sola vez; la base guarda solo su
      sha256. No existe (ni debe existir) endpoint para recuperarlo después:
      si se pierde, se regenera.
    - Regenerar reemplaza el hash: el token anterior deja de autenticar en el
      mismo instante.
    """
    if device_id not in KNOWN_DEVICES:
        raise HTTPException(404, "Dispositivo desconocido")
    token = secrets.token_urlsafe(48)  # 384 bits de entropía
    agent = db.get(Agent, device_id)
    if agent is None:
        agent = Agent(
            device_id=device_id,
            name=KNOWN_DEVICES[device_id],
            token_hash=hash_token(token),
        )
        db.add(agent)
    else:
        agent.token_hash = hash_token(token)
    db.commit()
    return {"device_id": device_id, "token": token}


@router.get("/commands/{command_id}")
def command_status(command_id: int, db: Session = Depends(get_db)):
    """Estado de un comando encolado; el frontend lo consulta tras un 202."""
    expirar_comandos(db)
    cmd = db.get(AgentCommand, command_id)
    if not cmd:
        raise HTTPException(404, "Comando no encontrado")
    return cmd.to_dict()
