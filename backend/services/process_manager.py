"""Arranque/paro directo de apps: SOLO se usa en modo local (Windows).

psutil se importa DENTRO de las funciones a propósito: en cloud este módulo
se importa (por los routers) pero jamás se ejecuta, y la imagen Docker del
cloud no instala psutil — un import a nivel de módulo la rompería.
"""

import os
import subprocess

CREATE_NEW_CONSOLE = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)


def start_app(folder: str, launcher: str) -> int:
    """Lanza el .bat de una app en su propia consola y regresa el PID de cmd.exe."""
    bat_path = os.path.join(folder, launcher)
    if not os.path.isfile(bat_path):
        raise FileNotFoundError(f"No existe el launcher: {bat_path}")
    proc = subprocess.Popen(
        ["cmd.exe", "/c", bat_path],
        cwd=folder,
        creationflags=CREATE_NEW_CONSOLE,
        close_fds=True,
    )
    return proc.pid


def pid_alive(pid: int) -> bool:
    import psutil

    try:
        return psutil.Process(pid).is_running()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return False


def pid_listening_on(port: int) -> int | None:
    import psutil

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


def _kill_tree(pid: int) -> bool:
    result = subprocess.run(
        ["taskkill", "/PID", str(pid), "/T", "/F"],
        capture_output=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    return result.returncode == 0


def stop_app(last_pid: int | None, port: int) -> dict:
    """Detiene una app: primero por el PID que lanzamos, si no, por el puerto."""
    if last_pid and pid_alive(last_pid):
        _kill_tree(last_pid)
        return {"stopped": True, "method": "taskkill_tree"}

    pid = pid_listening_on(port)
    if pid:
        _kill_tree(pid)
        return {"stopped": True, "method": "port_lookup"}

    return {"stopped": False, "method": "not_running"}
