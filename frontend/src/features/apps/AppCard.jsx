import { useEffect, useRef, useState } from "react";
import { apiDelete, apiPost } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import StatusPill from "../../components/ui/StatusPill.jsx";
import { mensajeDeComando, waitCommand } from "../../lib/agentCommands.js";

function PingBadge({ ms }) {
  if (ms == null) return null;
  const color = ms < 60 ? "text-ok" : ms < 150 ? "text-amber-500" : "text-err";
  const dot = ms < 60 ? "bg-ok" : ms < 150 ? "bg-amber-500" : "bg-err";
  return (
    <span
      className={`inline-flex items-center gap-1 ${color}`}
      title="Latencia desde este dispositivo hacia la app"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {ms} ms
    </span>
  );
}

// si tras un comando done el heartbeat no confirma el cambio en este plazo,
// se suelta el estado transitorio y manda lo que reporte el backend
const CONFIRM_TIMEOUT_MS = 45000;

/** Tarjeta de una app.
 *
 *  En local se comporta como siempre (start/stop directos, ping de puerto).
 *  En cloud las acciones van por la command queue: 202 + command_id, la
 *  tarjeta queda en Iniciando…/Deteniendo… hasta el desenlace real, y el
 *  running viene del heartbeat del Agent — el navegador jamás toca puertos.
 */
export default function AppCard({ app, status, ping, mode, agent, onEdit, onChanged, onStatusPoll }) {
  const isCloud = mode === "cloud";
  const running = status?.running ?? app.running ?? false;
  // online del agente de ESTA app (app.device_id); el fallback usa el status
  // por si el poll de agentes aún no respondió
  const agentOnline = isCloud
    ? (agent ? agent.online : status?.agent_online ?? app.agent_online ?? false)
    : true;

  const [pending, setPending] = useState(null); // null | "starting" | "stopping"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const timeoutRef = useRef(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearTimeout(timeoutRef.current);
    };
  }, []);

  // el estado transitorio se suelta cuando el backend confirma el cambio
  useEffect(() => {
    if (pending === "starting" && running) setPending(null);
    if (pending === "stopping" && !running) setPending(null);
  }, [pending, running]);

  const armarConfirmTimeout = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (aliveRef.current) setPending(null);
    }, CONFIRM_TIMEOUT_MS);
  };

  const accionCloud = async (accion) => {
    setBusy(true);
    setError(null);
    const transitorio = accion === "start" ? "starting" : "stopping";
    try {
      const r = await apiPost(`/api/apps/${app.id}/${accion}`);
      if (!r.queued) return; // por si el backend respondiera directo
      setPending(transitorio);
      setBusy(false);
      const cmd = await waitCommand(r.command_id);
      if (!aliveRef.current) return;
      if (cmd.status === "done") {
        // el comando terminó; el heartbeat confirma el estado final.
        // stop reporta not_running/unknown_process también como done+detalle
        if (cmd.result?.status === "unknown_process") {
          setPending(null);
          setError(mensajeDeComando(cmd, accion));
        } else if (accion === "stop" && cmd.result?.status === "not_running") {
          setPending(null);
        } else {
          armarConfirmTimeout();
        }
        onStatusPoll?.();
      } else {
        setPending(null);
        setError(mensajeDeComando(cmd, accion));
        onStatusPoll?.();
      }
    } catch (e) {
      if (!aliveRef.current) return;
      if (e.status === 409) {
        // ya hay una acción en curso o la PC está desconectada: el detail del
        // backend ya viene en humano; mantener la tarjeta coherente
        setError(e.message);
        if (e.message.includes("en curso")) setPending(transitorio);
      } else {
        setError(e.message);
        setPending(null);
      }
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  const startLocal = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/apps/${app.id}/start`);
      setPending("starting");
      // si en 60s el puerto nunca abrió, dejar de mostrar "iniciando"
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (aliveRef.current) setPending(null);
      }, 60000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const stopLocal = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/apps/${app.id}/stop`);
      setPending(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const start = () => (isCloud ? accionCloud("start") : startLocal());
  const stop = () => {
    if (!confirm(`¿Detener ${app.name}?`)) return;
    return isCloud ? accionCloud("stop") : stopLocal();
  };

  const remove = async () => {
    if (!confirm(`¿Quitar ${app.name} de HomeOS? (no borra su carpeta)`)) return;
    try {
      await apiDelete(`/api/apps/${app.id}`);
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  };

  // Local: mismo host con el que se abrió HomeOS (clave para Tailscale).
  // Cloud: el host lo reporta el Agent (agent_host); HomeOS corre en una VM
  // y window.location.hostname sería la VM, no tu PC. Solo navegación: el
  // navegador nunca hace fetch/ping a estos puertos en cloud.
  const panelHost = isCloud ? agent?.agent_host : window.location.hostname;
  const openPanel = () => window.open(`http://${panelHost}:${app.port}`, "_blank");
  const puedeAbrirPanel = Boolean(panelHost) && (!isCloud || agentOnline);

  const uiState = pending
    ? pending
    : !agentOnline
      ? "offline"
      : running
        ? "running"
        : "stopped";

  return (
    <GlassCard banner={app.banner_path} className="flex flex-col">
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            {app.icon_path ? (
              <img
                src={app.icon_path}
                alt=""
                className="h-10 w-10 rounded-xl object-cover"
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-semibold text-white"
                style={{ backgroundColor: app.accent || "#2383e2" }}
              >
                {app.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="font-semibold leading-tight">{app.name}</h3>
              <p className="flex items-center gap-2 text-xs text-ink-soft">
                Puerto {app.port}
                {!isCloud && running && <PingBadge ms={ping} />}
              </p>
            </div>
          </div>
          <StatusPill state={uiState} />
        </div>

        {error && <p className="text-xs text-err">{error}</p>}
        {isCloud && !agentOnline && !pending && (
          <p className="text-xs text-ink-soft">
            {(agent?.name || "La PC")} está desconectada. Enciéndela para usar esta función.
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-2">
          {running ? (
            <>
              <Button
                onClick={openPanel}
                className="flex-1"
                disabled={!puedeAbrirPanel}
                title={puedeAbrirPanel ? undefined : "No disponible sin conexión con la PC"}
              >
                Abrir panel
              </Button>
              <Button
                variant="danger"
                onClick={stop}
                disabled={busy || Boolean(pending) || !agentOnline}
              >
                {pending === "stopping" ? "Deteniendo…" : "Detener"}
              </Button>
            </>
          ) : (
            <Button
              onClick={start}
              disabled={busy || Boolean(pending) || !agentOnline}
              className="flex-1"
            >
              {pending === "starting" ? "Iniciando…" : "▶ Iniciar"}
            </Button>
          )}
          <Button variant="ghost" onClick={onEdit} title="Editar">
            ✏️
          </Button>
          <Button variant="ghost" onClick={remove} title="Quitar de HomeOS">
            🗑
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
