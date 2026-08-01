import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../api/client.js";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { dayKey } from "../../lib/calendarKinds.js";
import { PRIORIDAD } from "./ProjectsSection.jsx";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Grilla mensual mínima para los proyectos con fecha límite.
 *
 *  Propia y no la de CalendarPage: aquella es monolítica (filtros, drag,
 *  Google, detalle compartido) y extraerla costaría más que estas 42 celdas.
 */
export default function ProjectsCalendar({ items, onOpen }) {
  const hoy = new Date();
  const [anchor, setAnchor] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [weekStart, setWeekStart] = useState("monday");

  useEffect(() => {
    // el mismo inicio de semana que el calendario general
    apiGet("/api/settings").then((s) => setWeekStart(s.week_starts_on || "monday")).catch(() => {});
  }, []);

  const porDia = useMemo(() => {
    const map = {};
    for (const p of items) {
      if (!p.due_date) continue;
      const key = dayKey(new Date(p.due_date));
      (map[key] ||= []).push(p);
    }
    return map;
  }, [items]);

  const sinFecha = items.filter((p) => !p.due_date);

  // 42 celdas empezando en el lunes (o domingo) de la semana del dia 1
  const celdas = useMemo(() => {
    const primero = new Date(anchor);
    const dia = primero.getDay(); // 0 = domingo
    const atras = weekStart === "sunday" ? dia : (dia + 6) % 7;
    const inicio = new Date(primero);
    inicio.setDate(inicio.getDate() - atras);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [anchor, weekStart]);

  const cabecera =
    weekStart === "sunday" ? ["D", "L", "M", "M", "J", "V", "S"] : ["L", "M", "M", "J", "V", "S", "D"];
  const hoyKey = dayKey(hoy);

  return (
    <div className="flex flex-col gap-3">
      <GlassCard className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            className="rounded-lg px-2 py-1 text-ink-soft transition hover:bg-ink/5 hover:text-ink"
            onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
          >
            ‹
          </button>
          <p className="font-semibold">
            {MESES[anchor.getMonth()]} {anchor.getFullYear()}
          </p>
          <button
            className="rounded-lg px-2 py-1 text-ink-soft transition hover:bg-ink/5 hover:text-ink"
            onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px text-center text-[10px] text-ink-soft">
          {cabecera.map((d, i) => (
            <span key={i} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-ink/10">
          {celdas.map((d) => {
            const key = dayKey(d);
            const delMes = d.getMonth() === anchor.getMonth();
            const enDia = porDia[key] || [];
            return (
              <div
                key={key}
                className={`min-h-16 bg-surface p-1 ${delMes ? "" : "opacity-40"} ${
                  key === hoyKey ? "ring-2 ring-inset ring-accent" : ""
                }`}
              >
                <p className="text-right text-[10px] text-ink-soft">{d.getDate()}</p>
                <div className="flex flex-col gap-0.5">
                  {enDia.map((p) => {
                    const pr = PRIORIDAD[p.priority] || PRIORIDAD.P2;
                    return (
                      <button
                        key={p.id}
                        onClick={() => onOpen(p)}
                        className={`truncate rounded px-1 py-0.5 text-left text-[10px] font-medium text-white ${
                          p.progress === "terminado" ? "opacity-50 line-through" : ""
                        }`}
                        style={{ backgroundColor: pr.dot }}
                        title={`${p.title} (${p.priority})`}
                      >
                        {p.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {sinFecha.length > 0 && (
        <GlassCard className="p-3">
          <p className="mb-1.5 text-xs font-medium text-ink-soft">Sin fecha límite</p>
          <div className="flex flex-wrap gap-1.5">
            {sinFecha.map((p) => {
              const pr = PRIORIDAD[p.priority] || PRIORIDAD.P2;
              return (
                <button
                  key={p.id}
                  onClick={() => onOpen(p)}
                  className={`rounded-lg px-2 py-1 text-xs font-medium transition hover:opacity-80 ${pr.chip}`}
                >
                  {p.title}
                </button>
              );
            })}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
