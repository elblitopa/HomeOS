import { Link, useNavigate } from "react-router-dom";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { fmtMoney, priorityOf } from "../../lib/constants.js";
import { PRIORIDAD } from "../business/ProjectsSection.jsx";
import { urgencia } from "../finance/ResumenTab.jsx";

/** Bandeja de atención de Inicio: responde "¿qué necesita mi atención primero?"
 *
 *  No es una lista de P1s: clasifica por buckets temporales deterministas y la
 *  prioridad solo desempata DENTRO de cada bucket. Así "P2 venció ayer" gana
 *  siempre a "P1 vence en 20 días". Todo son vistas de registros reales
 *  (tareas y actividades de negocios); aquí no se guarda nada.
 *
 *  Buckets: 0 vencidos (más viejo primero) · 1 vence hoy · 2 en 1-3 días ·
 *  3 prioridad alta restante (con fecha primero, "sin fecha" al final) ·
 *  4 próximos (4-7 días). Lo demás no compite por la portada.
 */

const DIA_MS = 86400000;
const soloDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Días de calendario hasta la fecha (negativo = vencido), en hora local. */
function diasHasta(iso) {
  if (!iso) return null;
  return Math.round((soloDia(new Date(iso)) - soloDia(new Date())) / DIA_MS);
}

function bucketDe(dias, alta) {
  if (dias !== null && dias < 0) return 0;
  if (dias === 0) return 1;
  if (dias !== null && dias <= 3) return 2;
  if (alta) return 3;
  if (dias !== null && dias <= 7) return 4;
  return null; // sin urgencia: no compite por la portada
}

function etiquetaDias(dias) {
  if (dias === null) return "Sin fecha";
  if (dias < 0) return dias === -1 ? "Venció ayer" : `Venció hace ${-dias} días`;
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "Mañana";
  return `Faltan ${dias} días`;
}

// mismos tonos que ya usa HomeOS: err para lo crítico, ámbar para lo próximo
const TONO = {
  0: { dot: "bg-err", texto: "font-medium text-err" },
  1: { dot: "bg-err", texto: "font-medium text-err" },
  2: { dot: "bg-amber-500", texto: "text-amber-600 dark:text-amber-500" },
  3: { dot: "bg-amber-500/60", texto: "text-ink-soft" },
  4: { dot: "bg-ink/25", texto: "text-ink-soft" },
};

const MAX_ATENCION = 6;
const MAX_SUSCRIPCIONES = 5;

/** Normaliza tareas y actividades de negocio a una sola forma comparable. */
export function rankAtencion(tareas, proyectos) {
  const items = [];

  for (const t of tareas) {
    if (t.status === "completada") continue;
    const dias = diasHasta(t.due_date);
    // alta = Alta o Urgente del esquema 1-4 que ya usan las tareas
    const bucket = bucketDe(dias, t.priority >= 3);
    if (bucket === null) continue;
    items.push({
      key: `tarea-${t.id}`,
      tipo: "tarea",
      id: t.id,
      titulo: t.title,
      context_id: t.context_id,
      dias,
      bucket,
      peso: t.priority, // 1-4
      due_date: t.due_date,
    });
  }

  for (const p of proyectos) {
    if (p.progress === "terminado") continue;
    const dias = diasHasta(p.due_date);
    const bucket = bucketDe(dias, p.priority === "P1");
    if (bucket === null) continue;
    items.push({
      key: `actividad-${p.id}`,
      tipo: "actividad",
      id: p.id,
      titulo: p.title,
      context_id: p.context_id,
      dias,
      bucket,
      // P1=4, P2=2, P3=1 para desempatar contra el 1-4 de las tareas
      peso: p.priority === "P1" ? 4 : p.priority === "P2" ? 2 : 1,
      prioridadNegocio: p.priority,
      due_date: p.due_date,
    });
  }

  items.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    const da = a.dias === null ? Infinity : a.dias;
    const db = b.dias === null ? Infinity : b.dias;
    if (da !== db) return da - db; // vencidos: el más viejo primero
    return b.peso - a.peso;
  });
  return items;
}

function ChipPrioridad({ item }) {
  if (item.tipo === "actividad") {
    const pr = PRIORIDAD[item.prioridadNegocio] || PRIORIDAD.P2;
    return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${pr.chip}`}>{pr.label}</span>;
  }
  if (item.peso < 3) return null; // Media/Baja no necesitan etiqueta aquí
  const pr = priorityOf(item.peso);
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: pr.color, backgroundColor: `${pr.color}22` }}>
      {pr.label}
    </span>
  );
}

export default function AtencionSidebar({ tareas, proyectos, suscripciones, contextsById, onAbrirTarea }) {
  const navigate = useNavigate();
  const atencion = rankAtencion(tareas, proyectos).slice(0, MAX_ATENCION);
  const proximasSubs = suscripciones
    .filter((s) => s.next_due)
    .sort((a, b) => a.days_left - b.days_left)
    .slice(0, MAX_SUSCRIPCIONES);

  const abrir = (item) => {
    if (item.tipo === "tarea") {
      // el mismo detalle que abre un bloque del calendario
      onAbrirTarea({ kind: "tarea", ref_id: item.id, title: item.titulo, date: item.due_date });
    } else {
      // la actividad vive en su negocio; ahí está su editor de siempre
      navigate(`/negocios/${item.context_id}`);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <GlassCard className="p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-soft">⚡ Necesita tu atención</h2>
          <Link to="/tareas" className="text-xs text-accent hover:underline">
            Ver todas
          </Link>
        </div>
        {atencion.length === 0 ? (
          <p className="py-2 text-xs text-ink-soft">No hay pendientes urgentes 🎉</p>
        ) : (
          <div className="flex flex-col divide-y divide-ink/5">
            {atencion.map((item) => {
              const tono = TONO[item.bucket];
              const negocio = item.context_id ? contextsById[item.context_id] : null;
              return (
                <button
                  key={item.key}
                  onClick={() => abrir(item)}
                  className="flex items-start gap-2.5 py-2.5 text-left transition first:pt-1 last:pb-1 hover:bg-surface/60"
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tono.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.titulo}</p>
                    <p className="truncate text-xs text-ink-soft">
                      {negocio ? `${negocio.name} · ` : ""}
                      <span className={tono.texto}>{etiquetaDias(item.dias)}</span>
                    </p>
                  </div>
                  <ChipPrioridad item={item} />
                </button>
              );
            })}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-soft">🔁 Suscripciones próximas</h2>
          <Link to="/finanzas" className="text-xs text-accent hover:underline">
            Ver todas
          </Link>
        </div>
        {proximasSubs.length === 0 ? (
          <p className="py-2 text-xs text-ink-soft">No hay suscripciones próximas.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {proximasSubs.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate("/finanzas")}
                className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-left backdrop-blur transition ${urgencia(
                  s.days_left
                )}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-ink-soft">{fmtMoney(s.amount, s.currency)}</p>
                </div>
                <p className="shrink-0 text-xs text-ink-soft">
                  {s.days_left < 0
                    ? `⚠️ atrasado ${Math.abs(s.days_left)} d`
                    : s.days_left === 0
                      ? "⚠️ hoy"
                      : `en ${s.days_left} día${s.days_left > 1 ? "s" : ""}`}
                </p>
              </button>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
