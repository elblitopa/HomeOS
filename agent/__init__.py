"""HomeOS Windows Agent.

Conecta ESTA PC con HomeOS Cloud. Su único trabajo:
- autenticarse con el token de agente (X-HomeOS-Device-ID + X-HomeOS-Agent-Token),
- mandar heartbeat con el estado de las apps autorizadas,
- recibir comandos de un conjunto CERRADO (START_APP / STOP_APP / GET_STATUS /
  BROWSE_FOLDERS) y ejecutarlos contra su allowlist LOCAL,
- reportar resultados.

Lo que este agente NO es (a propósito y para siempre):
- NO es una terminal remota: no existe execute/shell/cmd/powershell/run_file.
- El cloud jamás decide rutas ni ejecutables: solo manda app_id, y el agente
  resuelve app_id -> folder/launcher contra agent/data/allowlist.json, que se
  aprueba a mano con la CLI (python -m agent approve <app_id>).
"""

VERSION = "1.0.0"
