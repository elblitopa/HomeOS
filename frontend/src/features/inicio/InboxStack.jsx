import { useState } from "react";
import { Link } from "react-router-dom";
import { apiPost } from "../../api/client.js";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { KIND } from "../../lib/calendarKinds.js";
import { formatDateTime } from "../../lib/constants.js";

function Fila({ item, color, contextName, onClick }) {
  const meta = KIND[item.kind];
  const cuando = item.date
    ? item.all_day
      ? new Date(item.date).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })
      : formatDateTime(item.date)
    : "sin fecha";

  return (
    <button
      onClick={() => onClick(item)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface/60"
    >
      <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${item.done ? "line-through opacity-60" : ""}`}>
          {meta?.icon} {item.title}
        </p>
        <p className="truncate text-xs text-ink-soft">
          {cuando}
          {item.detail ? ` · ${item.detail}` : ""}
          {contextName ? ` · ${contextName}` : ""}
        </p>
      </div>
    </button>
  );
}

/** Las rutinas no tienen tipo de calendario, así que no pueden abrir el
 *  detalle. Y tampoco lo necesitan: su única acción es marcarlas, así que un
 *  modal sería un toque de más. Van con su checkbox aquí mismo.
 *
 *  Se listan TODAS, hechas y pendientes, igual que en la sección de Rutinas:
 *  si las completadas desaparecieran no habría forma de desmarcar uno que se
 *  palomeó por error, y se perdería el gusto de ver el día completo. */
function Rutinas({ rutinas, onCambiada }) {
  const [ocupada, setOcupada] = useState(null);
  if (!rutinas.length) return null;

  const hechas = rutinas.filter((r) => r.done).length;

  const marcar = async (r) => {
    if (ocupada) return; // sin dobles toques: descuadrarían el estado
    setOcupada(r.id);
    try {
      await apiPost(`/api/routines/${r.id}/toggle`);
      onCambiada();
    } finally {
      setOcupada(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h2 className="flex items-baseline justify-between px-1 text-sm font-medium text-ink-soft">
        <span>
          Rutinas de hoy
          {hechas === rutinas.length && <span className="ml-1.5 text-ok">¡completas! 🎉</span>}
        </span>
        <Link to="/rutinas" className="text-xs text-accent hover:underline">
          {hechas}/{rutinas.length}
        </Link>
      </h2>
      <div className="flex flex-col gap-1.5">
        {rutinas.map((r) => (
          <button
            key={r.id}
            onClick={() => marcar(r)}
            disabled={ocupada === r.id}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
              r.done
                ? "border-ok/30 bg-ok/5"
                : "border-glass-border bg-surface/50 hover:border-accent/40"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs text-white transition ${
                r.done ? "border-ok bg-ok" : "border-ink/20"
              }`}
            >
              {r.done ? "✓" : ""}
            </span>
            <span className="text-lg">{r.icon}</span>
            <span
              className={`flex-1 text-sm font-medium ${
                r.done ? "text-ink-soft line-through" : ""
              }`}
            >
              {r.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function InboxStack({
  grupos,
  rutinas,
  cargando,
  completo,
  contextsById = {},
  colorDe,
  onAbrir,
  onRutinaCambiada,
}) {
  const [expandidos, setExpandidos] = useState({});
  // Hoy y Semana son dos vistas que se turnan, no dos bloques apilados: la
  // portada tiene que caber de un vistazo, y ver la semana completa cada vez
  // que abres el panel es ruido.
  const [vista, setVista] = useState("hoy");

  if (cargando) return null;

  // lo vencido cuenta como de hoy: es lo primero que hay que atender
  const deVista = {
    hoy: grupos.filter((g) => g.key === "vencido" || g.key === "hoy"),
    semana: grupos.filter((g) => g.key === "semana"),
  };
  // "sin fecha" y las rutinas no pertenecen a ninguna de las dos: van siempre
  const sueltos = grupos.filter((g) => g.key === "sinfecha");
  const cuenta = (k) => deVista[k].reduce((n, g) => n + g.items.length, 0);
  const visibles = deVista[vista];

  const VISTAS = [
    { key: "hoy", label: "Hoy" },
    { key: "semana", label: "Semana" },
  ];

  // el vacío solo cuando ya contestaron todas las fuentes: si no, saldría un
  // "nada pendiente" que se contradice medio segundo después
  if (completo && !grupos.length && !rutinas.length) {
    return (
      <GlassCard className="flex flex-col items-center gap-2 p-10 text-center">
        <span className="text-3xl">🌤️</span>
        <p className="font-medium">Nada pendiente por ahora</p>
        <p className="text-sm text-ink-soft">
          Cuando tengas eventos, tareas o pagos cerca, aparecerán aquí.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-1 rounded-xl bg-ink/5 p-1">
        {VISTAS.map((v) => (
          <button
            key={v.key}
            onClick={() => setVista(v.key)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              vista === v.key ? "bg-surface shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            {v.label}
            {/* el contador de la otra vista evita tener que cambiarse para ver
                si hay algo esperando allá */}
            {cuenta(v.key) > 0 && (
              <span className="ml-1.5 font-normal opacity-70">{cuenta(v.key)}</span>
            )}
          </button>
        ))}
      </div>

      {visibles.length === 0 && (
        <GlassCard className="p-6 text-center text-sm text-ink-soft">
          {vista === "hoy" ? "Nada para hoy 🎉" : "Nada más en los próximos días."}
        </GlassCard>
      )}

      {[...visibles, ...sueltos].map((g) => {
        const expandido = expandidos[g.key];
        const visibles = g.tope && !expandido ? g.items.slice(0, g.tope) : g.items;
        const ocultos = g.items.length - visibles.length;
        return (
          <div key={g.key} className="flex flex-col gap-2">
            <h2 className="flex items-baseline justify-between px-1 text-sm font-medium">
              <span className={g.tono === "err" ? "text-err" : "text-ink-soft"}>
                {g.titulo}
                <span className="ml-1.5 font-normal opacity-70">({g.items.length})</span>
              </span>
              {g.verTodo && (
                <Link to={g.verTodo} className="text-xs text-accent hover:underline">
                  Ver todas
                </Link>
              )}
            </h2>
            <GlassCard className="divide-y divide-ink/5">
              {visibles.map((item) => (
                <Fila
                  key={`${item.kind}-${item.ref_id}-${item.date || ""}`}
                  item={item}
                  color={colorDe(item)}
                  contextName={
                    item.context_id && contextsById[item.context_id]
                      ? contextsById[item.context_id].name
                      : null
                  }
                  onClick={onAbrir}
                />
              ))}
              {ocultos > 0 && (
                <button
                  onClick={() => setExpandidos((e) => ({ ...e, [g.key]: true }))}
                  className="w-full px-4 py-2 text-xs font-medium text-accent transition hover:bg-surface/60"
                >
                  Ver {ocultos} más
                </button>
              )}
            </GlassCard>
          </div>
        );
      })}

      <Rutinas rutinas={rutinas} onCambiada={onRutinaCambiada} />
    </div>
  );
}
