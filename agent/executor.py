"""Ejecución de comandos: tipos CERRADOS, allowlist local, defensa en profundidad.

El cloud ya validó el comando antes de encolarlo, pero aquí se valida TODO de
nuevo como si viniera de un desconocido:
- tipo fuera del enum -> rechazado (default: REJECT, nunca "probar a ver");
- cualquier dato de ejecución dentro del payload (launcher, folder, path de
  app, pid...) -> comando entero rechazado: las rutas salen EXCLUSIVAMENTE de
  la allowlist local y el PID del estado propio del agente;
- BROWSE_FOLDERS solo navega DENTRO de los roots autorizados en la config
  local, con realpath (resuelve .. , symlinks y junctions) antes de comparar.

Concurrencia: los comandos se procesan UNO a la vez (el loop de main.py llama
a este módulo secuencialmente y no hay más hilos ejecutores). Eso hace
triviales el tracking de PIDs y las carreras START/STOP. Si algún día se
paraleliza, este archivo necesita candados.
"""

import json
import os
import subprocess
import time

from agent import allowlist
from agent.config import AgentConfig, DATA_DIR
from agent import status as st

STATE_FILE = DATA_DIR / "state.json"  # {app_id: pid} de lo que ESTE agente lanzó

CREATE_NEW_CONSOLE = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

COMMAND_TYPES = {"START_APP", "STOP_APP", "GET_STATUS", "BROWSE_FOLDERS"}

MAX_PATH_LEN = 500
MAX_BROWSE_ENTRIES = 300  # el resultado debe caber holgado en 64KB
MAX_ERROR_LEN = 300

# segundos que se espera tras lanzar para detectar una app que muere al instante
STARTUP_GRACE_S = 3.0


class CommandRejected(Exception):
    """Comando que NO se ejecuta. El mensaje es seguro para mandarse al cloud."""


# ---------- estado local de PIDs (persistente, sin secretos) ----------


def _load_state() -> dict[str, int]:
    if not STATE_FILE.is_file():
        return {}
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        return {k: int(v) for k, v in data.items()} if isinstance(data, dict) else {}
    except (json.JSONDecodeError, ValueError, OSError):
        return {}


def _save_state(state: dict[str, int]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
    os.replace(tmp, STATE_FILE)


# ---------- validación (segunda línea; la primera fue el cloud) ----------


def validar_comando(cmd: dict) -> tuple[str, str | None, dict]:
    """Devuelve (type, app_id, payload) saneados o levanta CommandRejected."""
    if not isinstance(cmd, dict):
        raise CommandRejected("Comando malformado")
    tipo = cmd.get("type")
    if tipo not in COMMAND_TYPES:
        raise CommandRejected(f"Tipo de comando no permitido: {str(tipo)[:40]!r}")

    app_id = cmd.get("app_id")
    payload = cmd.get("payload") or {}
    if not isinstance(payload, dict):
        raise CommandRejected("payload malformado")

    if tipo in ("START_APP", "STOP_APP"):
        if not app_id:
            raise CommandRejected(f"{tipo} requiere app_id")
        try:
            app_id = allowlist.validar_app_id(app_id)
        except allowlist.AllowlistError as e:
            raise CommandRejected(str(e))

    # nada de datos de ejecución de contrabando: si el payload trae CUALQUIER
    # cosa que no corresponda al tipo (launcher, folder, pid...), se rechaza
    # el comando completo. Jamás se usa una ruta que venga del cloud.
    if tipo in ("START_APP", "STOP_APP", "GET_STATUS"):
        if payload:
            raise CommandRejected(f"{tipo} no acepta payload; se rechazó completo")
    elif tipo == "BROWSE_FOLDERS":
        extras = set(payload) - {"path"}
        if extras:
            raise CommandRejected(
                "BROWSE_FOLDERS solo acepta 'path'; se rechazó completo"
            )

    return tipo, app_id, payload


def _app_aprobada(app_id: str) -> dict:
    entry = allowlist.approved_apps().get(app_id)
    if not entry:
        raise CommandRejected(
            f"'{app_id}' no está autorizada en esta PC. "
            "Apruébala con: python -m agent approve " + app_id
        )
    return entry


# ---------- START / STOP / STATUS ----------


def start_app(app_id: str) -> dict:
    """Lanza el launcher LOCAL de una app APROBADA. Nada más y nada menos."""
    entry = _app_aprobada(app_id)
    folder, launcher, port = entry["folder"], entry["launcher"], entry["port"]

    state = _load_state()
    if st.pid_alive(state.get(app_id)) or st.port_open(port):
        return {"started": False, "detail": "La app ya estaba corriendo"}

    if not os.path.isdir(folder):
        raise CommandRejected("La carpeta autorizada de la app no existe en esta PC")
    bat = os.path.join(folder, launcher)
    if not os.path.isfile(bat):
        raise CommandRejected("El launcher autorizado de la app no existe en esta PC")

    try:
        proc = subprocess.Popen(
            ["cmd.exe", "/c", bat],
            cwd=folder,
            creationflags=CREATE_NEW_CONSOLE,
            close_fds=True,
        )
    except OSError:
        # el detalle completo queda en el log local; al cloud va lo seguro
        raise CommandRejected("Windows no pudo lanzar la app (ver log local)")

    state[app_id] = proc.pid
    _save_state(state)

    # una app que truena al instante no debe reportarse como iniciada
    time.sleep(STARTUP_GRACE_S)
    if not st.pid_alive(proc.pid) and not st.port_open(port):
        state.pop(app_id, None)
        _save_state(state)
        raise CommandRejected("La app terminó inmediatamente después de lanzarse")

    return {"started": True, "pid": proc.pid}


def _kill_tree(pid: int) -> bool:
    result = subprocess.run(
        ["taskkill", "/PID", str(pid), "/T", "/F"],
        capture_output=True,
        creationflags=CREATE_NO_WINDOW,
    )
    return result.returncode == 0


def stop_app(app_id: str) -> dict:
    """Detiene una app APROBADA. El PID sale del estado propio, NUNCA del cloud.

    Orden de certeza:
    1) el PID que este agente lanzó (si sigue vivo) -> taskkill del árbol;
    2) el PID que escucha el puerto AUTORIZADO de la app -> taskkill del árbol;
    3) nada corriendo -> se reporta, no es error fatal.
    """
    entry = _app_aprobada(app_id)
    state = _load_state()
    pid = state.get(app_id)

    if st.pid_alive(pid):
        ok = _kill_tree(pid)
        state.pop(app_id, None)
        _save_state(state)
        if ok:
            return {"stopped": True, "method": "taskkill_tree"}
        raise CommandRejected("taskkill no pudo detener el proceso (ver log local)")

    if pid is not None:
        state.pop(app_id, None)  # PID muerto: limpiar
        _save_state(state)

    pid_puerto = st.pid_listening_on(entry["port"])
    if pid_puerto:
        if _kill_tree(pid_puerto):
            return {"stopped": True, "method": "port_lookup"}
        raise CommandRejected("taskkill no pudo detener el proceso (ver log local)")

    return {"stopped": False, "method": "not_running"}


def get_status() -> dict:
    """{app_id: {running, port_open, pid}} SOLO de las apps aprobadas."""
    state = _load_state()
    return {
        "apps": {
            app_id: st.app_status(entry, state.get(app_id))
            for app_id, entry in allowlist.approved_apps().items()
        }
    }


# ---------- BROWSE, enjaulado en los roots ----------


def _mismo_o_debajo(root_real: str, path_real: str) -> bool:
    """¿path_real está dentro de root_real? Comparación por realpath + normcase
    (case-insensitive como el filesystem de Windows)."""
    root_n = os.path.normcase(root_real)
    path_n = os.path.normcase(path_real)
    try:
        return os.path.commonpath([root_n, path_n]) == root_n
    except ValueError:  # drives distintos
        return False


def browse_folders(config: AgentConfig, payload: dict) -> dict:
    """Lista carpetas y .bat DENTRO de los roots autorizados. Jamás ejecuta.

    Cadena de defensa sobre el path recibido:
    tipo/longitud/null byte -> sin segmentos '..' crudos -> realpath (resuelve
    symlinks y junctions de Windows) -> debe caer dentro de un root autorizado.
    """
    roots = config.browse_roots
    if not roots:
        raise CommandRejected(
            "Browse deshabilitado: esta PC no tiene HOMEOS_ALLOWED_BROWSE_ROOTS"
        )

    path = payload.get("path")
    if path is None or path == "":
        path = roots[0]
    if not isinstance(path, str):
        raise CommandRejected("path debe ser texto")
    if len(path) > MAX_PATH_LEN:
        raise CommandRejected("path demasiado largo")
    if "\x00" in path:
        raise CommandRejected("path inválido")
    # '..' crudo se rechaza aunque realpath lo resolvería igual: defensa doble
    if ".." in path.replace("/", "\\").split("\\"):
        raise CommandRejected("path inválido (no se acepta '..')")

    real = os.path.realpath(path)
    root = next((r for r in roots if _mismo_o_debajo(r, real)), None)
    if root is None:
        raise CommandRejected("Esa ruta está fuera de las carpetas autorizadas")
    if not os.path.isdir(real):
        raise CommandRejected("La ruta no existe")

    dirs: list[str] = []
    bats: list[str] = []
    truncado = False
    try:
        for item in sorted(os.listdir(real), key=str.lower):
            if len(dirs) + len(bats) >= MAX_BROWSE_ENTRIES:
                truncado = True
                break
            full = os.path.join(real, item)
            if os.path.isdir(full) and not item.startswith((".", "$")):
                dirs.append(item)
            elif item.lower().endswith(".bat"):
                bats.append(item)
    except PermissionError:
        raise CommandRejected("Sin permiso para leer esa carpeta")

    # el parent solo se ofrece si sigue DENTRO del root: desde el root no hay
    # botón de subir, el mundo termina ahí
    en_root = os.path.normcase(real) == os.path.normcase(root)
    parent = None if en_root else os.path.dirname(real)

    resultado = {"path": real, "parent": parent, "dirs": dirs, "bats": bats,
                 "roots": roots}
    if truncado:
        resultado["truncated"] = True
    return resultado


# ---------- dispatcher ----------


def ejecutar(config: AgentConfig, cmd: dict) -> tuple[bool, dict]:
    """Valida y ejecuta UN comando. Devuelve (ok, result) listos para reportar.

    Nunca deja escapar una excepción: cualquier cosa inesperada se convierte
    en un error seguro (el detalle completo lo loguea quien nos llamó).
    """
    tipo, app_id, payload = validar_comando(cmd)  # CommandRejected sube al caller

    if tipo == "START_APP":
        return True, start_app(app_id)
    if tipo == "STOP_APP":
        return True, stop_app(app_id)
    if tipo == "GET_STATUS":
        return True, get_status()
    if tipo == "BROWSE_FOLDERS":
        return True, browse_folders(config, payload)
    # inalcanzable (validar_comando ya filtró), pero el default es RECHAZAR
    raise CommandRejected("Tipo de comando no permitido")
