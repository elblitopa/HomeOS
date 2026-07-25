import { useEffect, useRef, useState } from "react";
import { apiDelete, apiPost } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import StatusPill from "../../components/ui/StatusPill.jsx";

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

export default function AppCard({ app, status, ping, onEdit, onChanged }) {
  const running = status?.running ?? app.running ?? false;
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const startTimeout = useRef(null);

  useEffect(() => {
    if (running) setStarting(false);
  }, [running]);

  useEffect(() => () => clearTimeout(startTimeout.current), []);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/apps/${app.id}/start`);
      setStarting(true);
      // si en 60s el puerto nunca abrio, dejar de mostrar "iniciando"
      startTimeout.current = setTimeout(() => setStarting(false), 60000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!confirm(`¿Detener ${app.name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/apps/${app.id}/stop`);
      setStarting(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
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

  // Clave para Tailscale: usar el mismo host con el que se abrio HomeOS.
  const openPanel = () =>
    window.open(`http://${window.location.hostname}:${app.port}`, "_blank");

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
                {running && <PingBadge ms={ping} />}
              </p>
            </div>
          </div>
          <StatusPill running={running} starting={starting && !running} />
        </div>

        {error && <p className="text-xs text-err">{error}</p>}

        <div className="mt-auto flex flex-wrap gap-2">
          {running ? (
            <>
              <Button onClick={openPanel} className="flex-1">
                Abrir panel
              </Button>
              <Button variant="danger" onClick={stop} disabled={busy}>
                Detener
              </Button>
            </>
          ) : (
            <Button onClick={start} disabled={busy || starting} className="flex-1">
              {starting ? "Iniciando…" : "▶ Iniciar"}
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
