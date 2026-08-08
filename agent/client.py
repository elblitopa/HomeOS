"""Cliente HTTP hacia HomeOS Cloud (los endpoints /api/agent-bridge/* de F2).

Solo stdlib (urllib): el agente no carga frameworks para tres requests.
El token viaja únicamente en el header X-HomeOS-Agent-Token; este módulo no
loguea headers ni URLs con datos — los mensajes de error son genéricos y el
detalle queda en la excepción para el log local (que además redacta secretos).
"""

import json
import urllib.error
import urllib.request

from agent import VERSION
from agent.config import AgentConfig, POLL_WAIT_S


class TransientError(Exception):
    """Red caída, timeout o 5xx: se reintenta con backoff, jamás mata el loop."""


class AuthError(Exception):
    """401: token o device_id inválidos. Se avisa claro y se reintenta lento."""


class RequestError(Exception):
    """4xx distinto de 401 (p. ej. 409 al reportar un comando ya expirado)."""

    def __init__(self, status: int, detail: str):
        super().__init__(f"HTTP {status}: {detail}")
        self.status = status
        self.detail = detail


class CloudClient:
    def __init__(self, config: AgentConfig):
        self._base = config.server_url
        self._headers = {
            "X-HomeOS-Device-ID": config.device_id,
            "X-HomeOS-Agent-Token": config.token,
            "Content-Type": "application/json",
            "User-Agent": f"homeos-agent/{VERSION}",
        }

    def _request(self, method: str, path: str, body: dict | None = None,
                 timeout: float = 15.0) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            self._base + path, data=data, headers=self._headers, method=method
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise AuthError(
                    "El servidor rechazó las credenciales del agente (401). "
                    "Verifica HOMEOS_DEVICE_ID y regenera el token si hace falta."
                )
            if 500 <= e.code < 600:
                raise TransientError(f"El servidor respondió {e.code}")
            try:
                detail = json.loads(e.read().decode("utf-8")).get("detail", "")
            except Exception:
                detail = ""
            raise RequestError(e.code, detail or e.reason)
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            # e puede traer la URL pero nunca headers; seguro para el log local
            raise TransientError(f"Sin conexión con HomeOS Cloud: {e}")
        except json.JSONDecodeError:
            raise TransientError("Respuesta ilegible del servidor")

    # ---------- los tres endpoints del bridge ----------

    def heartbeat(self, payload: dict) -> dict:
        return self._request("POST", "/api/agent-bridge/heartbeat", payload)

    def poll_command(self, wait: int = POLL_WAIT_S) -> dict | None:
        """Long-poll: bloquea hasta `wait` segundos. Devuelve el comando o None."""
        resp = self._request(
            "GET", f"/api/agent-bridge/commands?wait={wait}", timeout=wait + 10
        )
        return resp.get("command")

    def report_result(self, command_id: int, ok: bool, result: dict | None) -> dict:
        return self._request(
            "POST",
            f"/api/agent-bridge/commands/{command_id}/result",
            {"ok": ok, "result": result},
        )
