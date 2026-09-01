import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import { miniatura } from "../../components/ui/Comprobante.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import useCardSort from "../../hooks/useCardSort.js";
import useContexts from "../../hooks/useContexts.js";
import BusinessActivities from "./BusinessActivities.jsx";
import BusinessFormModal from "./BusinessFormModal.jsx";

/** Portada de Negocios: una tarjeta por negocio, con su banner.
 *
 *  Solo salen los contextos con la palomita is_business — un contexto normal
 *  (Personal, etc.) sigue siendo etiqueta sin aparecer aquí. La tarjeta entera
 *  navega al detalle; el asa ⠿ reordena (asa y no toda la tarjeta, para no
 *  matar el tap de navegación en el celular).
 */
export default function BusinessIndexPage() {
  const navigate = useNavigate();
  const { contexts, refresh } = useContexts();
  const [modal, setModal] = useState(null); // null | {} | {business}

  const negocios = useMemo(() => contexts.filter((c) => c.is_business), [contexts]);

  // acomodo local para la vista previa del drag; el servidor manda el real
  const [order, setOrder] = useState([]);
  useEffect(() => {
    const ids = negocios.map((n) => n.id);
    setOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [negocios]);

  const ordered = useMemo(() => {
    const byId = new Map(negocios.map((n) => [n.id, n]));
    return order.map((id) => byId.get(id)).filter(Boolean);
  }, [negocios, order]);

  const { draggingId, handleProps } = useCardSort({
    order,
    onReorder: setOrder,
    onCommit: (ids) => apiPost("/api/contexts/reorder", { ids }).catch(() => {}),
  });

  return (
    <div className="p-4 md:p-8">
      <TopBar title="Negocios">
        <Button onClick={() => setModal({})}>＋ Negocio</Button>
      </TopBar>

      {negocios.length === 0 ? (
        <GlassCard className="p-6">
          <p className="text-sm text-ink-soft">
            Aún no hay negocios. Crea el primero con ＋ Negocio, o marca un
            contexto existente como negocio en Ajustes.
          </p>
        </GlassCard>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {ordered.map((n) => (
            <GlassCard
              key={n.id}
              banner={miniatura(n.banner_path, 640)}
              data-sort-id={n.id}
              className={`relative cursor-pointer transition hover:bg-surface/75 ${
                draggingId === String(n.id) ? "scale-[0.98] opacity-60 ring-2 ring-accent" : ""
              }`}
            >
              <button
                {...handleProps(n.id)}
                className="absolute right-1.5 top-1.5 z-10 rounded-lg bg-surface/70 px-1.5 py-0.5 text-xs text-ink-soft backdrop-blur transition hover:text-ink"
                title="Arrastra para acomodar"
              >
                ⠿
              </button>
              <div className="p-4" onClick={() => navigate(`/negocios/${n.id}`)}>
                <span className="flex items-center gap-2 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: n.color }} />
                  {n.name}
                </span>
                <span className="mt-1 block text-xs text-ink-soft">
                  Proyectos, proveedores, pagos y más →
                </span>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* las mismas actividades de cada negocio, agregadas y filtrables */}
      {negocios.length > 0 && <BusinessActivities negocios={negocios} />}

      <BusinessFormModal
        open={!!modal}
        business={modal?.business || null}
        onClose={() => setModal(null)}
        onSaved={refresh}
      />
    </div>
  );
}
