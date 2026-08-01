import GlassCard from "../../components/ui/GlassCard.jsx";
import { PRIORIDAD, PROGRESOS, PROGRESO } from "./ProjectsSection.jsx";

const fmtFecha = (iso) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

/** La vista tipo Notion: columnas alineadas, una fila por proyecto. */
export default function ProjectsTable({ items, onOpen, onMove }) {
  if (items.length === 0) {
    return (
      <GlassCard className="p-8 text-center text-sm text-ink-soft">
        Sin proyectos todavía. Agrega el primero con ＋ Proyecto.
      </GlassCard>
    );
  }

  return (
    <GlassCard className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-xs text-ink-soft">
            <th className="px-3 py-2 font-medium">Prioridad</th>
            <th className="px-3 py-2 font-medium">Tarea</th>
            <th className="px-3 py-2 font-medium">Progreso</th>
            <th className="px-3 py-2 font-medium">Área</th>
            <th className="px-3 py-2 font-medium">Fecha límite</th>
            <th className="px-3 py-2 font-medium">Estrategia</th>
            <th className="px-3 py-2 font-medium">Clientes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {items.map((p) => {
            const pr = PRIORIDAD[p.priority] || PRIORIDAD.P2;
            const vencido = p.days_left != null && p.days_left < 0 && p.progress !== "terminado";
            return (
              <tr key={p.id} className="cursor-pointer transition hover:bg-ink/5" onClick={() => onOpen(p)}>
                <td className="px-3 py-2.5">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${pr.chip}`}>{pr.label}</span>
                </td>
                <td className={`max-w-56 truncate px-3 py-2.5 font-medium ${
                  p.progress === "terminado" ? "text-ink-soft line-through" : ""
                }`}>
                  {p.title}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  {/* cambiar el progreso sin abrir el modal */}
                  <select
                    value={p.progress}
                    onChange={(e) => onMove(p.id, e.target.value)}
                    className={`cursor-pointer rounded-lg border-0 px-2 py-1 text-xs font-medium outline-none ${
                      (PROGRESO[p.progress] || PROGRESOS[0]).chip
                    }`}
                  >
                    {PROGRESOS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.icon} {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2.5 text-xs text-ink-soft">{p.area || "—"}</td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-xs ${vencido ? "font-semibold text-err" : "text-ink-soft"}`}>
                  {p.due_date ? `${fmtFecha(p.due_date)}${vencido ? " ⏰" : ""}` : "—"}
                </td>
                <td className="max-w-48 truncate px-3 py-2.5 text-xs text-ink-soft">{p.strategy || "—"}</td>
                <td className="max-w-40 truncate px-3 py-2.5 text-xs text-ink-soft">{p.clients || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </GlassCard>
  );
}
