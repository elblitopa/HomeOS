import { useRef, useState } from "react";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { PRIORIDAD, PROGRESOS } from "./ProjectsSection.jsx";

/** Arrastrar una tarjeta a otra columna, con mouse o con el dedo.
 *
 *  Eventos de puntero y no el drag & drop de HTML5 (que usa el kanban de
 *  Contenido): iOS lo ignora y en el celular las tarjetas no se moverían.
 *  Mismo truco que useCardSort, pero detectando la columna bajo el dedo
 *  ([data-col]) en vez de otra tarjeta.
 */
function useColumnDrag({ onDrop }) {
  const [dragging, setDragging] = useState(null); // id en el aire
  const [overCol, setOverCol] = useState(null); // columna bajo el puntero
  const overRef = useRef(null);

  const finish = (id) => {
    if (overRef.current) onDrop(id, overRef.current);
    setDragging(null);
    setOverCol(null);
    overRef.current = null;
  };

  const handleProps = (id) => ({
    style: { touchAction: "none", cursor: dragging ? "grabbing" : "grab" },
    onPointerDown: (e) => {
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // sin captura el arrastre igual funciona
      }
      setDragging(id);
    },
    onPointerMove: (e) => {
      if (dragging == null) return;
      const col = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-col]");
      const key = col?.dataset.col ?? null;
      overRef.current = key;
      setOverCol(key);
    },
    onPointerUp: () => dragging != null && finish(dragging),
    onPointerCancel: () => {
      setDragging(null);
      setOverCol(null);
      overRef.current = null;
    },
    onClick: (e) => e.stopPropagation(), // que el asa no abra el modal
  });

  return { dragging, overCol, handleProps };
}

export default function ProjectsBoard({ items, onOpen, onMove }) {
  const { dragging, overCol, handleProps } = useColumnDrag({
    onDrop: (id, col) => {
      const item = items.find((p) => p.id === id);
      if (item && item.progress !== col) onMove(id, col);
    },
  });

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {PROGRESOS.map((col) => {
        const enCol = items.filter((p) => p.progress === col.key);
        return (
          <div
            key={col.key}
            data-col={col.key}
            className={`flex min-h-40 flex-col gap-2 rounded-2xl border-2 p-2 transition ${
              overCol === col.key && dragging != null
                ? "border-accent bg-accent/5"
                : "border-transparent bg-ink/[0.03]"
            }`}
          >
            <p className="flex items-center justify-between px-1 text-xs font-medium text-ink-soft">
              <span>
                {col.icon} {col.label}
              </span>
              <span>{enCol.length}</span>
            </p>
            {enCol.map((p) => {
              const pr = PRIORIDAD[p.priority] || PRIORIDAD.P2;
              const vencido = p.days_left != null && p.days_left < 0 && p.progress !== "terminado";
              return (
                <GlassCard
                  key={p.id}
                  className={`cursor-pointer p-3 transition hover:bg-surface/75 ${
                    dragging === p.id ? "opacity-50 ring-2 ring-accent" : ""
                  }`}
                  onClick={() => onOpen(p)}
                >
                  <div className="flex items-start gap-1.5">
                    <span className={`mt-0.5 shrink-0 rounded-md px-1.5 text-[10px] font-semibold ${pr.chip}`}>
                      {pr.label}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">{p.title}</span>
                    <button
                      {...handleProps(p.id)}
                      className="shrink-0 rounded px-1 text-xs text-ink-soft hover:text-ink"
                      title="Arrastra a otra columna"
                    >
                      ⠿
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-ink-soft">
                    {p.area && <span>{p.area}</span>}
                    {p.due_date && (
                      <span className={vencido ? "font-semibold text-err" : ""}>
                        📅 {new Date(p.due_date).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
