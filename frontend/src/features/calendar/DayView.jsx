import { useEffect, useMemo, useRef, useState } from "react";
import GlassCard from "../../components/ui/GlassCard.jsx";

const HOUR_H = 56; // alto de cada hora en px
const SNAP = 30; // los clicks se ajustan a media hora
const pad = (n) => String(n).padStart(2, "0");

/** Reparte en columnas los bloques que se encimen, como Google Calendar. */
function layout(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;

  const cerrar = () => {
    if (!cluster.length) return;
    const columnas = []; // fin de cada columna
    for (const item of cluster) {
      let col = columnas.findIndex((end) => end <= item.start);
      if (col === -1) {
        columnas.push(item.end);
        col = columnas.length - 1;
      } else {
        columnas[col] = item.end;
      }
      item.col = col;
    }
    for (const item of cluster) item.cols = columnas.length;
    out.push(...cluster);
    cluster = [];
    clusterEnd = -1;
  };

  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) cerrar();
    cluster.push({ ...b });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  cerrar();
  return out;
}

export default function DayView({ date, items, colorOf, kindMeta, onCreate, onOpen }) {
  const scroller = useRef(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const esHoy = date.toDateString() === now.toDateString();

  // separar lo que ocupa una franja horaria de lo que solo marca el día
  const { bloques, todoElDia } = useMemo(() => {
    const conHora = [];
    const arriba = [];
    for (const item of items) {
      // van a la linea de tiempo las cosas con hora real; el resto a la franja
      const conHorario = item.kind === "evento" || item.kind === "google";
      const enTimeline = (conHorario && !item.all_day) || item.kind === "tarea";
      if (!enTimeline) {
        arriba.push(item);
        continue;
      }
      const inicio = new Date(item.date);
      const minutos = inicio.getHours() * 60 + inicio.getMinutes();
      const fin = item.end ? new Date(item.end) : null;
      const duracion = fin ? Math.max(20, (fin - inicio) / 60000) : 60;
      conHora.push({ item, start: minutos, end: Math.min(1440, minutos + duracion) });
    }
    return { bloques: layout(conHora), todoElDia: arriba };
  }, [items]);

  // al abrir, encuadrar cerca de la hora actual (o de las 7am)
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const hora = esHoy ? Math.max(0, now.getHours() - 1) : 7;
    el.scrollTop = hora * HOUR_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const clickEnHora = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + e.currentTarget.scrollTop;
    const minutos = Math.max(0, Math.min(1439, Math.round((y / HOUR_H) * 60 / SNAP) * SNAP));
    const fecha = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    onCreate(`${fecha}T${pad(Math.floor(minutos / 60))}:${pad(minutos % 60)}`);
  };

  const minutosAhora = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="flex flex-col gap-3">
      {todoElDia.length > 0 && (
        <GlassCard className="p-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            Todo el día
          </p>
          <div className="flex flex-wrap gap-1.5">
            {todoElDia.map((item, i) => (
              <button
                key={`${item.kind}-${item.ref_id}-${i}`}
                onClick={() => onOpen(item)}
                className={`rounded-lg px-2 py-1 text-xs font-medium text-white ${
                  item.done ? "line-through opacity-60" : ""
                }`}
                style={{ backgroundColor: colorOf(item) }}
                title={item.detail || ""}
              >
                {kindMeta[item.kind]?.icon} {item.title}
                {item.detail ? ` · ${item.detail}` : ""}
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard className="overflow-hidden">
        <div
          ref={scroller}
          className="no-scrollbar relative max-h-[62vh] overflow-y-auto"
          onClick={clickEnHora}
          title="Toca una hora para crear un evento"
        >
          <div className="relative" style={{ height: 24 * HOUR_H }}>
            {/* rejilla de horas */}
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="absolute inset-x-0 border-t border-glass-border"
                style={{ top: h * HOUR_H, height: HOUR_H }}
              >
                <span className="absolute -top-2 left-2 bg-transparent text-[10px] text-ink-soft">
                  {pad(h)}:00
                </span>
              </div>
            ))}

            {/* linea de la hora actual */}
            {esHoy && (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                style={{ top: (minutosAhora / 60) * HOUR_H }}
              >
                <span className="ml-12 h-2 w-2 rounded-full bg-err" />
                <span className="h-px flex-1 bg-err" />
              </div>
            )}

            {/* bloques */}
            {bloques.map(({ item, start, end, col, cols }, i) => {
              const ancho = 100 / cols;
              return (
                <button
                  key={`${item.kind}-${item.ref_id}-${i}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(item);
                  }}
                  className={`absolute z-10 overflow-hidden rounded-lg px-1.5 py-0.5 text-left text-[11px] font-medium text-white shadow-sm ${
                    item.done ? "line-through opacity-60" : ""
                  }`}
                  style={{
                    top: (start / 60) * HOUR_H + 1,
                    height: ((end - start) / 60) * HOUR_H - 2,
                    left: `calc(3rem + ${col * ancho}%)`,
                    width: `calc(${ancho}% - 3rem / ${cols} - 4px)`,
                    backgroundColor: colorOf(item),
                  }}
                  title={`${item.title}${item.detail ? ` · ${item.detail}` : ""}`}
                >
                  <span className="block truncate">
                    {kindMeta[item.kind]?.icon} {item.title}
                  </span>
                  <span className="block truncate opacity-80">
                    {new Date(item.date).toLocaleTimeString("es-MX", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </GlassCard>

      <p className="text-xs text-ink-soft">
        Toca cualquier hora para crear un evento a esa hora.
      </p>
    </div>
  );
}
