"""La cola de comandos hacia los agentes (Fase 2 cloud).

Reglas de seguridad de esta cola:
- Tipos CERRADOS (COMMAND_TYPES); intentar encolar otro tipo es un bug y truena.
- Un comando de app lleva SOLO app_id. Las rutas (folder/launcher) jamás viajan
  en un comando: el agente las resuelve contra su allowlist local (Fase 3).
- TTLs: pending > 60s expira y running > 120s pasa a error por timeout. La
  expiración es PEREZOSA: se aplica al encolar, al reclamar y al consultar.
  No hay worker aparte — con un proceso y este patrón no hace falta.

Concurrencia (documentado a propósito):
- HomeOS corre con UN worker de uvicorn. Aun así, FastAPI atiende requests
  concurrentes en threads, así que:
  * el anti-duplicados usa un Lock de módulo alrededor de "verificar+insertar"
    (dos POST /start simultáneos: uno encola, el otro ve el pending y da 409);
  * el claim usa compare-and-set en SQL (UPDATE ... WHERE status='pending' y
    se verifica rowcount): aunque dos polls pidieran a la vez, solo uno gana.
- Si algún día HomeOS corriera con VARIOS workers/procesos, el Lock de módulo
  ya no bastaría para el anti-duplicados: habría que moverlo a la base (índice
  parcial único en Postgres, o SELECT ... FOR UPDATE). El claim con CAS ya es
  seguro multi-proceso tal como está.
"""

import threading
from datetime import datetime, timedelta

from sqlalchemy import update
from sqlalchemy.orm import Session

from backend.models.agent import (
    Agent,
    AgentCommand,
    COMMAND_TYPES,
    ONLINE_WINDOW_S,
    PENDING_TTL_S,
    RUNNING_TTL_S,
)

_enqueue_lock = threading.Lock()

# límites de payload: el browse necesita un path, pero nunca uno absurdo
MAX_PATH_LEN = 500
MAX_RESULT_BYTES = 64 * 1024  # el resultado de un browse cabe de sobra


class QueueError(Exception):
    """Error semántico de la cola; el router lo traduce a HTTP."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def agente_online(agent: Agent | None) -> bool:
    return bool(agent and agent.online)


def expirar_comandos(db: Session, device_id: str | None = None) -> None:
    """Aplica los TTLs. Se llama antes de cualquier lectura/escritura de la
    cola, así ningún camino puede ver (ni entregar) un comando vencido."""
    ahora = datetime.now()
    q_pend = update(AgentCommand).where(
        AgentCommand.status == "pending",
        AgentCommand.created_at < ahora - timedelta(seconds=PENDING_TTL_S),
    )
    q_run = update(AgentCommand).where(
        AgentCommand.status == "running",
        AgentCommand.started_at < ahora - timedelta(seconds=RUNNING_TTL_S),
    )
    if device_id:
        q_pend = q_pend.where(AgentCommand.device_id == device_id)
        q_run = q_run.where(AgentCommand.device_id == device_id)
    db.execute(q_pend.values(status="expired", finished_at=ahora))
    db.execute(
        q_run.values(
            status="error",
            finished_at=ahora,
            result={"detail": "timeout: el agente no reportó resultado a tiempo"},
        )
    )
    db.commit()


def _validar_payload(type_: str, app_id: str | None, payload: dict | None) -> None:
    if type_ not in COMMAND_TYPES:
        # esto seria un bug del backend, no input del usuario: reventar fuerte
        raise ValueError(f"Tipo de comando no permitido: {type_}")
    if type_ in ("START_APP", "STOP_APP") and not app_id:
        raise ValueError(f"{type_} requiere app_id")
    if payload:
        # los comandos de app no llevan payload extra: nada de rutas de contrabando
        if type_ in ("START_APP", "STOP_APP", "GET_STATUS"):
            raise ValueError(f"{type_} no acepta payload adicional")
        if type_ == "BROWSE_FOLDERS":
            path = payload.get("path")
            extras = set(payload) - {"path"}
            if extras:
                raise ValueError(f"BROWSE_FOLDERS no acepta: {', '.join(extras)}")
            if path is not None:
                if not isinstance(path, str):
                    raise ValueError("path debe ser texto")
                if len(path) > MAX_PATH_LEN:
                    raise ValueError("path demasiado largo")
                if "\x00" in path:
                    raise ValueError("path inválido")


def encolar(
    db: Session,
    device_id: str,
    type_: str,
    app_id: str | None = None,
    payload: dict | None = None,
) -> AgentCommand:
    """Encola un comando validando agente online y sin duplicados.

    Levanta QueueError(409) si la PC está desconectada o si ya hay un comando
    pending/running para la misma app (no queremos tres START_APP apilados).
    """
    _validar_payload(type_, app_id, payload)

    with _enqueue_lock:
        expirar_comandos(db, device_id)

        agent = db.get(Agent, device_id)
        if not agente_online(agent):
            nombre = (agent.name if agent else None) or device_id
            raise QueueError(409, f"{nombre} está desconectada. Enciéndela para usar esta función.")

        if app_id:
            ocupado = (
                db.query(AgentCommand)
                .filter(
                    AgentCommand.device_id == device_id,
                    AgentCommand.app_id == app_id,
                    AgentCommand.status.in_(["pending", "running"]),
                )
                .first()
            )
            if ocupado:
                raise QueueError(
                    409,
                    f"Ya hay una acción en curso para esta app ({ocupado.type.lower()}). Espera a que termine.",
                )

        cmd = AgentCommand(
            device_id=device_id, type=type_, app_id=app_id, payload=payload or None
        )
        db.add(cmd)
        db.commit()
        return cmd


def reclamar(db: Session, device_id: str) -> AgentCommand | None:
    """Entrega el comando pending más viejo del device, marcándolo running.

    El compare-and-set (WHERE status='pending' + rowcount) garantiza que un
    mismo comando jamás se entrega dos veces, incluso con polls simultáneos.
    """
    expirar_comandos(db, device_id)
    while True:
        candidato = (
            db.query(AgentCommand)
            .filter(
                AgentCommand.device_id == device_id,
                AgentCommand.status == "pending",
            )
            .order_by(AgentCommand.created_at)
            .first()
        )
        if not candidato:
            return None
        res = db.execute(
            update(AgentCommand)
            .where(AgentCommand.id == candidato.id, AgentCommand.status == "pending")
            .values(status="running", started_at=datetime.now())
        )
        db.commit()
        if res.rowcount == 1:
            db.refresh(candidato)
            return candidato
        # otro poll lo ganó en el instante intermedio; intentar el siguiente


def registrar_resultado(
    db: Session, device_id: str, command_id: int, ok: bool, result: dict | None
) -> AgentCommand:
    """El agente reporta el desenlace de SU comando.

    - Solo comandos del propio device_id (aislamiento entre agentes).
    - Solo desde running: un comando terminal (done/error/expired) es inmutable.
    """
    expirar_comandos(db, device_id)
    cmd = db.get(AgentCommand, command_id)
    if not cmd or cmd.device_id != device_id:
        # mismo 404 para "no existe" y "es de otro device": no filtrar existencia
        raise QueueError(404, "Comando no encontrado")
    if cmd.status != "running":
        raise QueueError(409, f"El comando ya no acepta resultado (está {cmd.status})")
    cmd.status = "done" if ok else "error"
    cmd.result = result or None
    cmd.finished_at = datetime.now()
    db.commit()
    return cmd
