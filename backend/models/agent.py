"""Agentes: las máquinas satélite (la PC Windows) y su cola de comandos.

Un Agent es un dispositivo registrado que ejecuta acciones locales (lanzar y
parar las apps de esa máquina). El cloud NUNCA le manda rutas ni comandos de
shell: solo tipos cerrados con app_id, y el agente resuelve contra su propia
allowlist (Fase 3).
"""

from datetime import datetime, timedelta

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base

# online = mandó heartbeat hace menos de esto. Se DERIVA de last_seen, no se
# guarda un booleano: un booleano se queda mentiroso cuando la PC se apaga.
ONLINE_WINDOW_S = 90


class Agent(Base):
    __tablename__ = "agents"

    device_id: Mapped[str] = mapped_column(String, primary_key=True)  # "pc-principal"
    name: Mapped[str] = mapped_column(String, default="")
    platform: Mapped[str] = mapped_column(String, default="windows")
    # hostname/IP de Tailscale que reporta el agente; el frontend lo usa para
    # "Abrir panel" de las apps (que corren en esa máquina, no en el cloud)
    agent_host: Mapped[str | None] = mapped_column(String, nullable=True)
    # SOLO el hash sha256 del token; el valor original vive en el .env del agente
    token_hash: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[str | None] = mapped_column(String, nullable=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # último estado de apps reportado en heartbeat: {app_id: {running, port_open, pid}}
    # Es STATUS informativo, nunca autorización para ejecutar nada.
    apps_status: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    @property
    def online(self) -> bool:
        if not self.last_seen:
            return False
        return datetime.now() - self.last_seen < timedelta(seconds=ONLINE_WINDOW_S)

    def to_dict(self) -> dict:
        # sin token_hash ni nada interno: esto viaja al frontend
        return {
            "device_id": self.device_id,
            "name": self.name or self.device_id,
            "platform": self.platform,
            "agent_host": self.agent_host,
            "version": self.version,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "online": self.online,
        }


# estados y tipos CERRADOS: nada de comandos arbitrarios
COMMAND_TYPES = {"START_APP", "STOP_APP", "GET_STATUS", "BROWSE_FOLDERS"}
COMMAND_STATUSES = {"pending", "running", "done", "error", "expired"}

# TTLs: una PC que despierta 10 minutos tarde NO debe ejecutar órdenes viejas
PENDING_TTL_S = 60
RUNNING_TTL_S = 120


class AgentCommand(Base):
    __tablename__ = "agent_commands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str] = mapped_column(
        ForeignKey("agents.device_id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String, nullable=False)
    # el app de la orden (START/STOP); el agente resuelve app_id -> rutas
    app_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # parámetros extra explícitamente permitidos por tipo (ej. path del browse)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending")
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "device_id": self.device_id,
            "type": self.type,
            "app_id": self.app_id,
            "payload": self.payload or {},
            "status": self.status,
            "result": self.result,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
        }
