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

const DIA_MS = 86400000;
const soloDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Grilla mensual genérica con el look liquid glass del calendario general.
 *
 *  Un item con getEndDate que cubre varios días se pinta como UN SOLO bloque
 *  que abarca sus casillas (como las barras del calendario de Notion): cada
 *  semana es su propio grid y los bloques son items del grid con gridColumn
 *  extendido, en carriles apilados si se encimara con otro. Solo si el evento
 *  cruza de una semana a la siguiente se parte en dos segmentos.
 *
 *  renderChip(item, esInicio): esInicio=false únicamente en el segmento de
 *  una semana posterior (ahí conviene pintar una versión "↪ sigue").
 *
 *  La grilla de CalendarPage sigue aparte: esa es monolítica (filtros,
 *  Google, drag) y extraerla costaría más que esto.
 */
export default function MonthGrid({ items, getDate, getEndDate, renderChip, onOpen, sinFecha = null }) {
  const hoy = new Date();
  const [anchor, setAnchor] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [weekStart, setWeekStart] = useState("monday");

  useEffect(() => {
    // el mismo inicio de semana que el calendario general
    apiGet("/api/settings").then((s) => setWeekStart(s.week_starts_on || "monday")).catch(() => {});
  }, []);

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

  // por semana: sus 7 dias y los segmentos de bloques que la tocan
  const semanas = useMemo(() => {
    const sems = Array.from({ length: 6 }, (_, w) => ({
      dias: celdas.slice(w * 7, w * 7 + 7),
      segmentos: [],
      carriles: 0,
    }));
    const base = soloDia(celdas[0]);
    const idxDe = (fecha) => Math.round((soloDia(new Date(fecha)) - base) / DIA_MS);

    for (const item of items) {
      const fecha = getDate(item);
      if (!fecha) continue;
      const a = idxDe(fecha);
      const finRaw = getEndDate ? getEndDate(item) : null;
      // tope de 14 dias por si un fin quedo mal capturado
      const b = finRaw ? Math.min(Math.max(idxDe(finRaw), a), a + 13) : a;
      if (b < 0 || a > 41) continue;
      const a0 = Math.max(a, 0);
      const b0 = Math.min(b, 41);
      for (let w = Math.floor(a0 / 7); w <= Math.floor(b0 / 7); w++) {
        const wIni = w * 7;
        sems[w].segmentos.push({
          item,
          c1: Math.max(a0, wIni) - wIni,
          c2: Math.min(b0, wIni + 6) - wIni,
          esInicio: a >= wIni, // el dia real de inicio cae en esta semana
        });
      }
    }

    // carriles: si dos bloques comparten dias se apilan, no se enciman
    for (const sem of sems) {
      const ocupado = []; // por carril, los rangos [c1, c2] ya tomados
      for (const seg of sem.segmentos) {
        let carril = 0;
        while ((ocupado[carril] || []).some(([x1, x2]) => !(seg.c2 < x1 || seg.c1 > x2))) {
          carril += 1;
        }
        (ocupado[carril] ||= []).push([seg.c1, seg.c2]);
        seg.carril = carril;
      }
      sem.carriles = ocupado.length;
    }
    return sems;
  }, [celdas, items, getDate, getEndDate]);

  const pendientes = sinFecha ? items.filter((i) => !getDate(i)) : [];
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
            <div key={d} className="pb-1 text-center text-xs font-semibold text-ink-soft">
              {d}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          {semanas.map((sem, w) => (
            <div
              key={w}
              className="grid grid-cols-7 gap-1"
              // la primera fila reserva el alto del numero del dia; las demas
              // son un carril de bloques cada una
              style={{ gridTemplateRows: `1.75rem repeat(${sem.carriles}, auto)` }}
            >
              {sem.dias.map((d, i) => {
                const key = dayKey(d);
                const delMes = d.getMonth() === anchor.getMonth();
                return (
                  <div
                    key={key}
                    className={`min-h-16 rounded-xl border border-transparent p-1 transition hover:border-accent/40 hover:bg-accent-soft/40 md:min-h-24 md:p-1.5 ${
                      delMes ? "" : "opacity-35"
                    }`}
                    style={{ gridColumn: i + 1, gridRow: `1 / span ${sem.carriles + 1}` }}
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                        key === hoyKey ? "bg-accent text-white" : ""
                      }`}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
              {sem.segmentos.map((seg) => (
                <button
                  key={`${seg.item.id}-${w}-${seg.carril}`}
                  onClick={() => onOpen(seg.item)}
                  className="z-10 mx-1 mb-1 self-start text-left md:mx-1.5"
                  style={{ gridColumn: `${seg.c1 + 1} / ${seg.c2 + 2}`, gridRow: seg.carril + 2 }}
                >
                  {renderChip(seg.item, seg.esInicio)}
                </button>
              ))}
            </div>
          ))}
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
