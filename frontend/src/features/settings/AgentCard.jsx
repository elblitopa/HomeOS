import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";

const DEVICE_ID = "pc-principal";

// "hace 2 min" legible para last_seen; null si nunca se ha visto
function haceCuanto(iso) {
  if (!iso) return null;
  const seg = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seg < 60) return "hace unos segundos";
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

export default function AgentCard() {
  const [agente, setAgente] = useState(null); // fila de /api/agents o null
  const [cargado, setCargado] = useState(false);
  const [token, setToken] = useState(null); // SOLO vive en memoria de esta vista
  const [copiado, setCopiado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refrescar = () =>
    apiGet("/api/agents")
      .then((lista) => {
        setAgente(lista.find((a) => a.device_id === DEVICE_ID) || null);
        setCargado(true);
      })
      .catch(() => setCargado(true));

  useEffect(() => {
    refrescar();
    const t = setInterval(refrescar, 30000);
    return () => clearInterval(t);
  }, []);

  const generar = async () => {
    if (
      agente &&
      !confirm(
        "¿Regenerar el token?\n\nEl token anterior deja de funcionar de inmediato: " +
          "el agente de la PC quedará desconectado hasta que pegues el nuevo en su .env."
      )
    )
      return;
    setBusy(true);
    setError(null);
    setCopiado(false);
    try {
      const r = await apiPost(`/api/agents/${DEVICE_ID}/token`);
      setToken(r.token);
      refrescar();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiado(true);
    } catch {
      /* sin permiso de portapapeles: el token queda visible para copiarlo a mano */
    }
  };

  return (
    <GlassCard className="p-5">
      <h2 className="mb-1 font-semibold">PC Principal</h2>
      <p className="mb-3 text-sm text-ink-soft">
        El agente que conecta tu PC con HomeOS Cloud para iniciar y detener tus apps.
      </p>

      {cargado && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              agente?.online ? "bg-ok" : "bg-ink/25"
            }`}
          />
          {agente ? (
            <span className={agente.online ? "" : "text-ink-soft"}>
              {agente.online
                ? "En línea"
                : `Desconectada${
                    haceCuanto(agente.last_seen)
                      ? ` · última señal ${haceCuanto(agente.last_seen)}`
                      : " · aún sin conectar"
                  }`}
              {agente.version ? ` · agente v${agente.version}` : ""}
            </span>
          ) : (
            <span className="text-ink-soft">Sin registrar · genera un token para empezar</span>
          )}
        </div>
      )}

      {token && (
        <div className="mb-3 rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-3">
          <p className="mb-2 text-sm font-medium">
            ⚠️ Guarda este token ahora. No podrá volver a mostrarse.
          </p>
          <p className="mb-2 text-sm text-ink-soft">
            Pégalo como <code>HOMEOS_AGENT_TOKEN</code> en <code>agent/.env</code> de tu PC.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-surface/70 px-2 py-1.5 text-xs">
              {token}
            </code>
            <Button variant="ghost" onClick={copiar}>
              {copiado ? "Copiado ✓" : "Copiar"}
            </Button>
          </div>
        </div>
      )}

      <Button onClick={generar} disabled={busy}>
        {agente ? "Regenerar token" : "Generar token"}
      </Button>
      {error && <p className="mt-2 text-sm text-err">{error}</p>}
    </GlassCard>
  );
}
