import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPut } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import useContexts from "../../hooks/useContexts.js";
import BusinessFormModal from "./BusinessFormModal.jsx";
import ContentSection from "./ContentSection.jsx";
import PaymentsSection from "./PaymentsSection.jsx";
import ProjectsSection from "./ProjectsSection.jsx";
import ProvidersSection from "./ProvidersSection.jsx";
import SectionCardsView from "./SectionCardsView.jsx";
import {
  CompetitorsSection,
  CrmSection,
  DocsSection,
  ManualSection,
  MessagesSection,
} from "./BusinessSections.jsx";

// `hint` es el subtítulo de la tarjeta en la vista de tarjetas
const SECTIONS = [
  { key: "proyectos", label: "Proyectos", hint: "La matriz de pendientes" },
  { key: "proveedores", label: "Proveedores", hint: "Contactos y catálogos" },
  { key: "pagos", label: "Pagos", hint: "Cuánto debo y a quién" },
  { key: "crm", label: "CRM", hint: "Finanzas del negocio" },
  { key: "contenido", label: "Contenido", hint: "Pipeline de videos" },
  { key: "competidores", label: "Competidores", hint: "El mapa de la competencia" },
  { key: "mensajes", label: "Mensajes", hint: "Plantillas para copiar" },
  { key: "docs", label: "Documentos", hint: "Contratos y archivos" },
  { key: "manual", label: "Manual", hint: "Procesos y notas" },
];

const AGENDA = { key: "agenda", label: "Agenda", hint: "Eventos de clientes" };

const MODO_KEY = "negocios-vista-detalle"; // "tabs" | "tarjetas"

/** Todo lo de un negocio, en su propia página (/negocios/:id). */
export default function BusinessDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { contexts, byId, refresh } = useContexts();
  const [editando, setEditando] = useState(false);

  // vista del detalle: barra de tabs o grid de tarjetas (se recuerda)
  const [modo, setModo] = useState(() => localStorage.getItem(MODO_KEY) || "tabs");
  // en tarjetas, null = mostrando el grid; en tabs, null se trata como proyectos
  const [section, setSection] = useState(null);

  const cambiarModo = (m) => {
    setModo(m);
    localStorage.setItem(MODO_KEY, m);
    if (m === "tarjetas") setSection(null);
  };

  // bump para que las secciones que lo usan refresquen tras un cambio
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const negocio = useMemo(() => byId[Number(id)], [byId, id]);

  // banners de las tarjetas de sección (business_info.section_banners)
  const [banners, setBanners] = useState({});
  useEffect(() => {
    if (!negocio) return;
    apiGet(`/api/business/info/${negocio.id}`)
      .then((info) => setBanners(info.section_banners || {}))
      .catch(() => {});
  }, [negocio?.id, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarBanner = async (key, path) => {
    // el dict completo, no una mutación: el backend asigna lo que llegue
    const nuevos = { ...banners };
    if (path) nuevos[key] = path;
    else delete nuevos[key];
    setBanners(nuevos); // respuesta inmediata
    try {
      await apiPut(`/api/business/info/${negocio.id}`, { section_banners: nuevos });
    } catch {
      setBanners(banners); // si falla, se revierte
    }
  };

  const secciones = useMemo(() => {
    if (!negocio?.has_agenda) return SECTIONS;
    // la Agenda al frente de las demás: es lo operativo del día a día
    return [SECTIONS[0], AGENDA, ...SECTIONS.slice(1)];
  }, [negocio?.has_agenda]);

  // si la sección activa deja de existir (ej. se apagó la Agenda), regresar
  useEffect(() => {
    if (section && !secciones.some((s) => s.key === section)) setSection(null);
  }, [secciones, section]);

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

  // en tabs siempre hay una sección activa; en tarjetas puede ser el grid
  const activa = modo === "tabs" ? section || "proyectos" : section;
  const metaActiva = secciones.find((s) => s.key === activa);

  const renderSection = (key) => (
    <>
      {key === "agenda" && (
        <GlassCard className="p-8 text-center text-sm text-ink-soft">
          La Agenda de eventos llega en la siguiente fase.
        </GlassCard>
      )}
      {key === "proyectos" && <ProjectsSection contextId={negocio.id} />}
      {key === "proveedores" && (
        <ProvidersSection contextId={negocio.id} contexts={contexts} contextsById={byId} version={version} />
      )}
      {key === "pagos" && <PaymentsSection contextId={negocio.id} version={version} />}
      {key === "crm" && <CrmSection contextId={negocio.id} contextsById={byId} version={version} />}
      {key === "contenido" && <ContentSection contextId={negocio.id} />}
      {key === "competidores" && <CompetitorsSection contextId={negocio.id} />}
      {key === "mensajes" && <MessagesSection contextId={negocio.id} />}
      {key === "docs" && <DocsSection contextId={negocio.id} />}
      {key === "manual" && <ManualSection contextId={negocio.id} />}
    </>
  );

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
        <div className="flex gap-1 rounded-xl bg-ink/5 p-1" title="Cómo ver las secciones">
          <button
            onClick={() => cambiarModo("tabs")}
            className={`rounded-lg px-2 py-1 text-sm transition ${
              modo === "tabs" ? "bg-surface shadow-sm" : "text-ink-soft"
            }`}
            title="Barra de pestañas"
          >
            ☰
          </button>
          <button
            onClick={() => cambiarModo("tarjetas")}
            className={`rounded-lg px-2 py-1 text-sm transition ${
              modo === "tarjetas" ? "bg-surface shadow-sm" : "text-ink-soft"
            }`}
            title="Tarjetas"
          >
            ▦
          </button>
        </div>
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

      {modo === "tabs" && (
        <div className="mb-6 flex flex-wrap gap-1 rounded-2xl bg-ink/5 p-1 md:w-fit">
          {secciones.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition ${
                activa === s.key ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {modo === "tarjetas" && activa && (
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={() => setSection(null)}
            className="rounded-lg px-2 py-1 text-sm text-ink-soft transition hover:bg-ink/5 hover:text-ink"
          >
            ‹ Secciones
          </button>
          <span className="font-semibold">{metaActiva?.label}</span>
        </div>
      )}

      {modo === "tarjetas" && !activa ? (
        <SectionCardsView
          sections={secciones}
          banners={banners}
          onOpen={setSection}
          onBannerChange={cambiarBanner}
        />
      ) : (
        activa && renderSection(activa)
      )}

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
