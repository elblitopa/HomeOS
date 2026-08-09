import { useState } from "react";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import useAgents from "../../hooks/useAgents.js";
import useAppPings from "../../hooks/useAppPings.js";
import useApps from "../../hooks/useApps.js";
import useMode from "../../hooks/useMode.js";
import AppCard from "./AppCard.jsx";
import AppFormModal from "./AppFormModal.jsx";

const DEFAULT_DEVICE_ID = "pc-principal";

/** Indicador discreto del estado de cada PC (solo cloud). */
function AgentBanner({ agents }) {
  const lista = Object.values(agents);
  if (lista.length === 0) return null;
  return (
    <GlassCard className="mb-4 flex flex-col gap-1 px-4 py-3">
      {lista.map((a) => (
        <div key={a.device_id} className="flex items-center gap-2 text-sm">
          <span
            className={`h-2.5 w-2.5 rounded-full ${a.online ? "bg-ok" : "bg-err/70"}`}
          />
          <span className="font-medium">{a.name}</span>
          <span className={a.online ? "text-ok" : "text-err"}>
            {a.online ? "En línea" : "Desconectada"}
          </span>
        </div>
      ))}
    </GlassCard>
  );
}

export default function AppsPage() {
  const mode = useMode(); // null mientras carga; "local" | "cloud"
  const isCloud = mode === "cloud";
  const { apps, status, loading, error, refresh, pollStatus } = useApps();
  const { agents } = useAgents(isCloud);
  // en cloud el navegador JAMÁS toca los puertos de las apps: sin targets
  const pings = useAppPings(isCloud ? [] : apps, status);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (app) => {
    setEditing(app);
    setModalOpen(true);
  };

  const runningCount = Object.values(status).filter((s) => s.running).length;
  const agenteDe = (app) => agents[app.device_id || DEFAULT_DEVICE_ID] || null;
  const agentePrincipal = agents[DEFAULT_DEVICE_ID] || null;

  return (
    <div className="p-4 md:p-8">
      <TopBar
        title="Apps"
        subtitle={
          apps.length
            ? `${runningCount} de ${apps.length} activas`
            : "Registra tus proyectos para lanzarlos desde aquí"
        }
      >
        <Button onClick={openNew}>＋ Agregar app</Button>
      </TopBar>

      {isCloud && <AgentBanner agents={agents} />}

      {error && (
        <GlassCard className="mb-4 border-err/30 p-4 text-sm text-err">
          {error}
        </GlassCard>
      )}

      {loading ? (
        <p className="text-ink-soft">Cargando…</p>
      ) : apps.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-3 p-12 text-center">
          <span className="text-4xl">🚀</span>
          <p className="font-medium">Aún no hay apps registradas</p>
          <p className="max-w-sm text-sm text-ink-soft">
            Agrega la carpeta de un proyecto (con su .bat y su puerto) y podrás
            iniciarlo, detenerlo y abrir su panel desde cualquier dispositivo.
          </p>
          <Button onClick={openNew}>Agregar mi primera app</Button>
        </GlassCard>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {apps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              status={status[app.id]}
              ping={pings[app.id]}
              mode={mode}
              agent={agenteDe(app)}
              onEdit={() => openEdit(app)}
              onChanged={refresh}
              onStatusPoll={pollStatus}
            />
          ))}
        </div>
      )}

      <AppFormModal
        open={modalOpen}
        app={editing}
        mode={mode}
        agentOnline={!isCloud || Boolean(agentePrincipal?.online)}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          refresh();
        }}
      />
    </div>
  );
}
