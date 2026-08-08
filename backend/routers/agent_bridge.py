"""Canal máquina-a-máquina con los agentes (/api/agent-bridge/*).

Auth PROPIA y separada de la de usuario:
- El agente manda X-HomeOS-Device-ID + X-HomeOS-Agent-Token en cada request.
- El device_id localiza al agente (una sola fila) y el token se compara en
  tiempo constante contra su hash sha256. Sin el device_id habría que barrer
  todos los hashes de la tabla; con él la verificación es O(1) y además el
  request declara explícitamente quién dice ser.
- Una cookie de usuario NO sirve aquí, y este token NO sirve en /api/agents/*
  ni en ningún endpoint de usuario (el middleware de cookie solo excluye este
  prefijo; el token únicamente se acepta en las dependencias de este router).
"""

import hashlib
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import anyio

from backend.database import SessionLocal, get_db
from backend.models import Agent
from backend.services import agent_queue

router = APIRouter(prefix="/api/agent-bridge", tags=["agent-bridge"])

MAX_APPS_EN_HEARTBEAT = 100


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def require_agent(
    device_id: str = Header(alias="X-HomeOS-Device-ID", default=""),
    token: str = Header(alias="X-HomeOS-Agent-Token", default=""),
    db: Session = Depends(get_db),
) -> Agent:
    if not device_id or not token:
        raise HTTPException(401, "Faltan credenciales de agente")
    agent = db.get(Agent, device_id)
    # comparar SIEMPRE contra algo (aunque el device no exista) para que el
    # tiempo de respuesta no revele qué device_ids están registrados
    esperado = agent.token_hash if agent else hash_token(secrets.token_hex(16))
    if not secrets.compare_digest(hash_token(token), esperado) or agent is None:
        raise HTTPException(401, "Credenciales de agente inválidas")
    return agent


class AppStatusReport(BaseModel):
    running: bool = False
    port_open: bool = False
    pid: int | None = None


class HeartbeatPayload(BaseModel):
    name: str = Field(default="", max_length=80)
    platform: str = Field(default="windows", max_length=30)
    version: str = Field(default="", max_length=40)
    agent_host: str = Field(default="", max_length=120)
    # {app_id: estado}. Es STATUS informativo: jamás autoriza ejecutar nada.
    apps: dict[str, AppStatusReport] = {}


@router.post("/heartbeat")
def heartbeat(
    payload: HeartbeatPayload,
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    if len(payload.apps) > MAX_APPS_EN_HEARTBEAT:
        raise HTTPException(413, "Reporte de apps demasiado grande")
    agent.last_seen = datetime.now()
    if payload.name:
        agent.name = payload.name
    if payload.platform:
        agent.platform = payload.platform
    if payload.version:
        agent.version = payload.version
    if payload.agent_host:
        agent.agent_host = payload.agent_host
    # asignación completa (no mutación): columnas JSON de SQLAlchemy
    agent.apps_status = {
        app_id: estado.model_dump() for app_id, estado in payload.apps.items()
    }
    db.commit()
    return {"ok": True, "server_time": datetime.now().isoformat()}


@router.get("/commands")
async def poll_commands(
    wait: int = Query(default=0, ge=0, le=25),
    agent: Agent = Depends(require_agent),
):
    """Entrega el siguiente comando del device autenticado (y solo de él).

    Con wait > 0 es long-poll: reintenta cada segundo hasta `wait` segundos
    antes de responder vacío — así el navegar carpetas no siente el poll.
    La sesión de BD se abre por intento, no se retiene durante la espera.
    """
    device_id = agent.device_id
    intentos = max(1, wait)
    for i in range(intentos):
        with SessionLocal() as db:
            cmd = agent_queue.reclamar(db, device_id)
            if cmd:
                return {"command": cmd.to_dict()}
        if i < intentos - 1:
            await anyio.sleep(1)
    return {"command": None}


class ResultPayload(BaseModel):
    ok: bool
    result: dict | None = None


@router.post("/commands/{command_id}/result")
def report_result(
    command_id: int,
    payload: ResultPayload,
    agent: Agent = Depends(require_agent),
    db: Session = Depends(get_db),
):
    if payload.result is not None:
        import json

        if len(json.dumps(payload.result)) > agent_queue.MAX_RESULT_BYTES:
            raise HTTPException(413, "Resultado demasiado grande")
    try:
        cmd = agent_queue.registrar_resultado(
            db, agent.device_id, command_id, payload.ok, payload.result
        )
    except agent_queue.QueueError as e:
        raise HTTPException(e.status, e.detail)
    return {"ok": True, "status": cmd.status}
