import { useState } from "react";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import useApps from "../../hooks/useApps.js";
import AppCard from "./AppCard.jsx";
import AppFormModal from "./AppFormModal.jsx";

export default function AppsPage() {
  const { apps, status, loading, error, refresh } = useApps();
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
              onEdit={() => openEdit(app)}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <AppFormModal
        open={modalOpen}
        app={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          refresh();
        }}
      />
    </div>
  );
}
