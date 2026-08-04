import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../api/client.js";
import GlassCard from "./GlassCard.jsx";
import { dayKey } from "../../lib/calendarKinds.js";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
// mismos rótulos que el calendario general, para que se sientan hermanos
const DIAS_LUN = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIAS_DOM = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Grilla mensual genérica con el mismo look liquid glass del calendario
 *  general (celdas redondeadas con hover, número del día en círculo, hoy en
 *  acento). Quien la usa decide qué fecha manda (getDate) y cómo se pinta
 *  cada bloque (renderChip); el onClick lo pone la grilla con onOpen.
 *
 *  Extraída de la vista Calendario de Proyectos para no copiarla por
 *  tercera vez con la Agenda. La de CalendarPage sigue aparte: esa es
 *  monolítica (filtros, Google, drag) y extraerla costaría más que esto.
 *
 *  sinFecha: {label, render} | null — franja para los items sin fecha.
 */
export default function MonthGrid({ items, getDate, renderChip, onOpen, sinFecha = null }) {
  const hoy = new Date();
  const [anchor, setAnchor] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [weekStart, setWeekStart] = useState("monday");

  useEffect(() => {
    // el mismo inicio de semana que el calendario general
    apiGet("/api/settings").then((s) => setWeekStart(s.week_starts_on || "monday")).catch(() => {});
  }, []);

  const porDia = useMemo(() => {
    const map = {};
    for (const item of items) {
      const fecha = getDate(item);
      if (!fecha) continue;
      const key = dayKey(new Date(fecha));
      (map[key] ||= []).push(item);
    }
    return map;
  }, [items, getDate]);

  const pendientes = sinFecha ? items.filter((i) => !getDate(i)) : [];

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

  const cabecera = weekStart === "sunday" ? DIAS_DOM : DIAS_LUN;
  const hoyKey = dayKey(hoy);

  return (
    <div className="flex flex-col gap-3">
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <button
            className="rounded-lg px-2.5 py-1 text-ink-soft transition hover:bg-ink/5 hover:text-ink"
            onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
          >
            ‹
          </button>
          <p className="font-semibold">
            {MESES[anchor.getMonth()]} {anchor.getFullYear()}
          </p>
          <button
            className="rounded-lg px-2.5 py-1 text-ink-soft transition hover:bg-ink/5 hover:text-ink"
            onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cabecera.map((d) => (
            <div key={d} className="pb-2 text-center text-xs font-semibold text-ink-soft">
              {d}
            </div>
          ))}
          {celdas.map((d) => {
            const key = dayKey(d);
            const delMes = d.getMonth() === anchor.getMonth();
            const enDia = porDia[key] || [];
            return (
              <div
                key={key}
                className={`min-h-16 rounded-xl border border-transparent p-1 transition hover:border-accent/40 hover:bg-accent-soft/40 md:min-h-24 md:p-1.5 ${
                  delMes ? "" : "opacity-35"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    key === hoyKey ? "bg-accent text-white" : ""
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="mt-0.5 flex flex-col gap-1">
                  {enDia.map((item) => (
                    <button key={item.id} onClick={() => onOpen(item)} className="block w-full text-left">
                      {renderChip(item)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {sinFecha && pendientes.length > 0 && (
        <GlassCard className="p-3">
          <p className="mb-1.5 text-xs font-medium text-ink-soft">{sinFecha.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {pendientes.map((item) => (
              <button key={item.id} onClick={() => onOpen(item)}>
                {sinFecha.render(item)}
              </button>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
