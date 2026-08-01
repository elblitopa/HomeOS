import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import useContexts from "../../hooks/useContexts.js";
import BusinessFormModal from "./BusinessFormModal.jsx";
import ContentSection from "./ContentSection.jsx";
import ProjectsSection from "./ProjectsSection.jsx";
import ProvidersSection from "./ProvidersSection.jsx";
import {
  CompetitorsSection,
  CrmSection,
  DocsSection,
  ManualSection,
  MessagesSection,
} from "./BusinessSections.jsx";

const SECTIONS = [
  { key: "proyectos", label: "Proyectos" },
  { key: "proveedores", label: "Proveedores" },
  { key: "pagos", label: "Pagos" },
  { key: "crm", label: "CRM" },
  { key: "contenido", label: "Contenido" },
  { key: "competidores", label: "Competidores" },
  { key: "mensajes", label: "Mensajes" },
  { key: "docs", label: "Documentos" },
  { key: "manual", label: "Manual" },
];

/** Todo lo de un negocio, en su propia página (/negocios/:id). */
export default function BusinessDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { contexts, byId, refresh } = useContexts();
  const [section, setSection] = useState("proyectos");
  const [editando, setEditando] = useState(false);

  // bump para que las secciones que lo usan refresquen tras un cambio
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const negocio = useMemo(() => byId[Number(id)], [byId, id]);

  // useContexts arranca vacío: hasta que llegue la lista no se sabe si el id
  // existe, y pintar el aviso de "no existe" en ese hueco parpadearía
  if (contexts.length === 0) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-sm text-ink-soft">Cargando…</p>
      </div>
    );
  }

  if (!negocio) {
    return (
      <div className="p-4 md:p-8">
        <GlassCard className="p-8 text-center text-sm text-ink-soft">
          Este negocio no existe (¿se eliminó?).{" "}
          <Link to="/negocios" className="text-accent hover:underline">
            Volver a Negocios
          </Link>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <TopBar
        title={
          <span className="flex items-center gap-2">
            <Link to="/negocios" className="text-ink-soft transition hover:text-ink" title="Volver a Negocios">
              ‹
            </Link>
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: negocio.color }} />
            {negocio.name}
          </span>
        }
      >
        <Button variant="ghost" onClick={() => setEditando(true)}>
          ✏️ Editar
        </Button>
      </TopBar>

      {negocio.banner_path && (
        <div
          className="mb-4 h-28 rounded-2xl bg-cover bg-center md:h-36"
          style={{ backgroundImage: `url(${negocio.banner_path})` }}
        />
      )}

      <div className="mb-6 flex flex-wrap gap-1 rounded-2xl bg-ink/5 p-1 md:w-fit">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition ${
              section === s.key ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "proyectos" && <ProjectsSection contextId={negocio.id} />}
      {section === "proveedores" && (
        <ProvidersSection contextId={negocio.id} contexts={contexts} contextsById={byId} version={version} />
      )}
      {section === "pagos" && (
        <GlassCard className="p-8 text-center text-sm text-ink-soft">
          Los pagos a terceros llegan en una fase próxima.
        </GlassCard>
      )}
      {section === "crm" && <CrmSection contextId={negocio.id} contextsById={byId} version={version} />}
      {section === "contenido" && <ContentSection contextId={negocio.id} />}
      {section === "competidores" && <CompetitorsSection contextId={negocio.id} />}
      {section === "mensajes" && <MessagesSection contextId={negocio.id} />}
      {section === "docs" && <DocsSection contextId={negocio.id} />}
      {section === "manual" && <ManualSection contextId={negocio.id} />}

      <BusinessFormModal
        open={editando}
        business={negocio}
        onClose={() => setEditando(false)}
        onSaved={() => {
          refresh();
          reload();
        }}
        onDeleted={() => navigate("/negocios")}
      />
    </div>
  );
}
