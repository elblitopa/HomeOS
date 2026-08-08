"""Estado de las apps autorizadas: lo mínimo que el cloud necesita saber.

Solo se reporta {running, port_open, pid} de las apps APROBADAS. Nunca la
lista de procesos de Windows, ni variables de entorno, ni rutas.
"""

import socket

import psutil


def pid_alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        return psutil.Process(pid).is_running()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return False


def port_open(port: int, timeout: float = 0.4) -> bool:
    """¿Hay algo escuchando en localhost:puerto? (connect, no escaneo)."""
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


def pid_listening_on(port: int) -> int | None:
    """El PID que escucha el puerto; para el fallback de STOP_APP."""
    try:
        for conn in psutil.net_connections(kind="tcp"):
            if (
                conn.laddr
                and conn.laddr.port == port
                and conn.status == psutil.CONN_LISTEN
                and conn.pid
            ):
                return conn.pid
    except (psutil.AccessDenied, OSError):
        pass
    return None


def app_status(entry: dict, pid: int | None) -> dict:
    """Estado de UNA app aprobada. `pid` es el que ESTE agente lanzó (o None)."""
    vivo = pid_alive(pid)
    abierto = port_open(entry["port"])
    return {
        "running": vivo or abierto,
        "port_open": abierto,
        "pid": pid if vivo else None,
    }
