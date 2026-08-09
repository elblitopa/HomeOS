import { apiGet } from "../api/client.js";

/** Utilidades del canal cloud → Agent: esperar comandos y traducir errores.
 *
 *  En cloud, start/stop/browse responden 202 + command_id; el desenlace real
 *  llega después por GET /api/agents/commands/{id}. Aquí vive el patrón de
 *  espera (poll ~1s hasta estado terminal) y el mapeo de resultados a textos
 *  humanos: al usuario nunca se le muestra JSON crudo.
 */

const POLL_MS = 1000;
// > que los TTL del backend (pending 60s + running 120s): el comando SIEMPRE
// alcanza un estado terminal antes de esto; es solo un cinturón de seguridad
const TIMEOUT_MS = 150000;

export async function waitCommand(commandId, { signal } = {}) {
  const inicio = Date.now();
  let fallosSeguidos = 0;
  for (;;) {
    if (signal?.aborted) throw new Error("cancelado");
    if (Date.now() - inicio > TIMEOUT_MS) {
      return { status: "expired", result: null };
    }
    try {
      const cmd = await apiGet(`/api/agents/commands/${commandId}`);
      fallosSeguidos = 0;
      if (["done", "error", "expired"].includes(cmd.status)) return cmd;
    } catch (e) {
      if (e.status === 401) throw e; // sesión perdida: que suba al LoginGate
      // red intermitente: tolerar unos cuantos fallos antes de rendirse
      if (++fallosSeguidos >= 8) return { status: "expired", result: null };
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/** Texto humano para el desenlace de un comando que NO terminó en done.
 *  Los `detail` que manda el Agent ya son mensajes seguros y en español
 *  (jamás incluyen rutas del payload ni secretos), así que se muestran tal
 *  cual cuando existen; los códigos conocidos tienen su propia traducción. */
export function mensajeDeComando(cmd, accion) {
  const result = cmd?.result || {};
  if (cmd?.status === "expired") {
    return accion === "start"
      ? "No se pudo iniciar la app a tiempo."
      : "La operación expiró antes de llegar a la PC.";
  }
  if (result.status === "unknown_process") {
    return "No se pudo verificar de forma segura el proceso de esta app.";
  }
  const detail = typeof result.detail === "string" ? result.detail : "";
  if (detail.includes("no está autorizada")) {
    return "Esta app todavía no está autorizada en tu PC. Apruébala desde la PC con la CLI del agente.";
  }
  if (detail.includes("no existe en esta PC")) {
    return "El launcher autorizado no existe actualmente en la PC.";
  }
  if (detail) return detail;
  return accion === "start"
    ? "La PC no pudo iniciar la app."
    : "La PC no pudo detener la app.";
}

/** Texto humano para un BROWSE_FOLDERS que no terminó en done. */
export function mensajeDeBrowse(cmd) {
  if (cmd?.status === "expired") {
    return "La operación expiró antes de llegar a la PC.";
  }
  const detail = typeof cmd?.result?.detail === "string" ? cmd.result.detail : "";
  if (detail.includes("fuera de las carpetas autorizadas")) {
    return "Esta carpeta no está autorizada para exploración desde HomeOS.";
  }
  if (detail.includes("deshabilitado")) {
    return "La exploración remota está deshabilitada en la PC (sin carpetas autorizadas en el agente).";
  }
  return detail || "La PC no pudo explorar la carpeta.";
}
