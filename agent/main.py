"""El proceso del Agent: heartbeat + command loop, con reconexión infinita.

Dos hilos y nada más:
- heartbeat: cada 15s manda estado al cloud. Si la red falla, backoff
  (1,2,5,10,30s) y al recuperar manda un heartbeat INMEDIATO.
- comandos: long-poll de 25s; ejecuta UN comando a la vez (secuencial: el
  único hilo que ejecuta es este — así el tracking de PIDs y los START/STOP
  no tienen carreras) y reporta el resultado.

Ningún error de una app, de un comando o de la red termina el proceso: el
agente vive mientras Windows viva. Solo la config inválida (sin .env) o
Ctrl+C lo detienen.
"""

import platform
import socket
import threading
import time

from agent import VERSION, allowlist, executor
from agent import status as st
from agent.client import AuthError, CloudClient, RequestError, TransientError
from agent.config import (
    AgentConfig,
    BACKOFF_STEPS_S,
    HEARTBEAT_INTERVAL_S,
    load_config,
)
from agent.logging_config import setup_logging

# tras un 401 no tiene caso martillar: reintento lento hasta que cambien el .env
AUTH_RETRY_S = 30


class Backoff:
    """1s, 2s, 5s, 10s, 30s, 30s, ... reset() al primer éxito."""

    def __init__(self):
        self._intento = 0

    def next_delay(self) -> int:
        delay = BACKOFF_STEPS_S[min(self._intento, len(BACKOFF_STEPS_S) - 1)]
        self._intento += 1
        return delay

    def reset(self) -> bool:
        """Devuelve True si veníamos de fallos (útil para loguear 'reconectado')."""
        habia_fallos = self._intento > 0
        self._intento = 0
        return habia_fallos


def _heartbeat_payload(config: AgentConfig) -> dict:
    pids = executor.pids_registrados()
    return {
        "name": config.name or config.device_id,
        "platform": "windows",
        "version": VERSION,
        "agent_host": socket.gethostname(),
        "apps": {
            app_id: st.app_status(entry, pids.get(app_id))
            for app_id, entry in allowlist.approved_apps().items()
        },
    }


def _hilo_heartbeat(config: AgentConfig, client: CloudClient, log, stop: threading.Event):
    backoff = Backoff()
    while not stop.is_set():
        try:
            client.heartbeat(_heartbeat_payload(config))
            if backoff.reset():
                log.info("Reconectado: heartbeat aceptado de nuevo")
            espera = HEARTBEAT_INTERVAL_S
        except AuthError as e:
            log.error(str(e))
            espera = AUTH_RETRY_S
        except (TransientError, RequestError) as e:
            log.warning(f"Heartbeat falló: {e}")
            espera = backoff.next_delay()
        except Exception:
            log.exception("Error inesperado en heartbeat")
            espera = backoff.next_delay()
        stop.wait(espera)


def _procesar(config: AgentConfig, client: CloudClient, log, cmd: dict) -> None:
    cmd_id = cmd.get("id")
    tipo = cmd.get("type")
    app_id = cmd.get("app_id")
    log.info(f"Comando #{cmd_id} recibido: {tipo} app_id={app_id}")
    try:
        ok, result = executor.ejecutar(config, cmd)
    except executor.CommandRejected as e:
        ok, result = False, {"detail": str(e)[: executor.MAX_ERROR_LEN]}
        log.warning(f"Comando #{cmd_id} rechazado: {e}")
    except Exception:
        # el stack completo SOLO al log local; al cloud un mensaje seguro
        log.exception(f"Comando #{cmd_id} tronó inesperadamente")
        ok, result = False, {"detail": "Error interno del agente (ver log local)"}

    # reportar con reintentos cortos; si aun así no se puede, el TTL del
    # servidor lo marcará como timeout y aquí queda constancia local
    for intento in range(3):
        try:
            client.report_result(cmd_id, ok, result)
            log.info(f"Comando #{cmd_id} reportado: ok={ok}")
            return
        except RequestError as e:
            log.warning(f"El servidor no aceptó el resultado de #{cmd_id}: {e}")
            return  # 404/409: el comando expiró o ya es terminal; no insistir
        except (TransientError, AuthError) as e:
            log.warning(f"No se pudo reportar #{cmd_id} (intento {intento + 1}/3): {e}")
            time.sleep(2)
    log.error(f"Resultado de #{cmd_id} no reportado; el servidor lo expirará")


def _hilo_comandos(config: AgentConfig, client: CloudClient, log, stop: threading.Event):
    backoff = Backoff()
    while not stop.is_set():
        try:
            cmd = client.poll_command()
            if backoff.reset():
                log.info("Reconectado: long-poll de comandos activo")
            if cmd:
                _procesar(config, client, log, cmd)
        except AuthError as e:
            log.error(str(e))
            stop.wait(AUTH_RETRY_S)
        except (TransientError, RequestError) as e:
            log.warning(f"Poll de comandos falló: {e}")
            stop.wait(backoff.next_delay())
        except Exception:
            log.exception("Error inesperado en el loop de comandos")
            stop.wait(backoff.next_delay())


def run() -> int:
    try:
        config = load_config()
    except Exception as e:
        # sin logging todavía (y sin secretos que redactar: el mensaje es seguro)
        print(f"[homeos-agent] {e}")
        return 1

    log = setup_logging(config.secrets)
    log.info(
        f"HomeOS Agent v{VERSION} iniciando: device={config.device_id} "
        f"server={config.server_url} host={socket.gethostname()} "
        f"({platform.system()} {platform.release()})"
    )
    aprobadas = list(allowlist.approved_apps())
    log.info(f"Apps aprobadas en allowlist local: {aprobadas or 'ninguna'}")
    if not config.browse_roots:
        log.info("Sin HOMEOS_ALLOWED_BROWSE_ROOTS: browse deshabilitado")

    stop = threading.Event()
    client = CloudClient(config)
    hilos = [
        threading.Thread(target=_hilo_heartbeat, args=(config, client, log, stop),
                         name="heartbeat", daemon=True),
        threading.Thread(target=_hilo_comandos, args=(config, client, log, stop),
                         name="comandos", daemon=True),
    ]
    for h in hilos:
        h.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("Deteniendo agente (Ctrl+C)")
        stop.set()
        for h in hilos:
            h.join(timeout=5)
    return 0
