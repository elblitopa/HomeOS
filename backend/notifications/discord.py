"""Stub de notificaciones Discord.

En fases futuras (calendario, tareas) los modulos llamaran send_webhook()
con la URL guardada en una tabla de ajustes. Por ahora es un no-op seguro.
"""

import json
import urllib.request


def send_webhook(content: str, webhook_url: str | None = None) -> bool:
    if not webhook_url:
        return False
    data = json.dumps({"content": content}).encode("utf-8")
    req = urllib.request.Request(
        webhook_url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "HomeOS"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10):
            return True
    except OSError:
        return False
