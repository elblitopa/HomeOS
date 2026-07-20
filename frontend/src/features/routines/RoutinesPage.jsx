import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { inputCls } from "../todos/TaskFormModal.jsx";

const dayKey = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
};

const WEEKDAY_SHORT = ["D", "L", "M", "M", "J", "V", "S"];

function encouragement(done, total) {
  if (total === 0) return "Crea tu primera rutina 👇";
  if (done === 0) return "¡Arranca con la primera! 💪";
  if (done === total) return "¡Día perfecto! 🎉";
  if (done / total >= 0.5) return "¡Ya casi! Sigue así 🔥";
  return "Buen inicio, no pares ✨";
}

// Gráfica de barras de 30 días (azul, minimalista)
function MonthChart({ days }) {
  const width = 600;
  const height = 120;
  const barGap = 2;
  const barWidth = (width - barGap * (days.length - 1)) / days.length;
  return (
    <svg viewBox={`0 0 ${width} ${height + 18}`} className="w-full">
      {days.map((d, i) => {
        const pct = d.total ? d.done / d.total : 0;
        const h = Math.max(2, pct * height);
        const x = i * (barWidth + barGap);
        const isToday = i === days.length - 1;
        return (
          <g key={d.date}>
            <rect
              x={x}
              y={height - h}
              width={barWidth}
              height={h}
              rx={2}
              fill={isToday ? "#2383e2" : pct === 1 ? "#2383e2" : "#2383e2"}
              opacity={pct === 0 ? 0.12 : 0.25 + pct * 0.75}
            >
              <title>{`${d.date}: ${d.done}/${d.total}`}</title>
            </rect>
            {i % 5 === 0 && (
              <text x={x + barWidth / 2} y={height + 14} textAnchor="middle" fontSize="9" fill="#6b6b70">
                {d.date.slice(8)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function RoutinesPage() {
  const [routines, setRoutines] = useState([]);
  const [stats, setStats] = useState(null);
  const [weekLogs, setWeekLogs] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", icon: "✅" });

  const refresh = useCallback(() => {
    apiGet("/api/routines").then(setRoutines).catch(() => {});
    apiGet("/api/routines/stats?days=30").then(setStats).catch(() => {});
    apiGet("/api/routines/logs?days=7").then(setWeekLogs).catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    if (modal) setForm({ name: modal.item?.name || "", icon: modal.item?.icon || "✅" });
  }, [modal]);

  const toggle = async (r) => {
    await apiPost(`/api/routines/${r.id}/toggle`);
    refresh();
  };

  const save = async () => {
    if (!form.name.trim()) return;
    const payload = { name: form.name.trim(), icon: form.icon || "✅", active: true, sort_order: 0 };
    if (modal.item) await apiPut(`/api/routines/${modal.item.id}`, payload);
    else await apiPost("/api/routines", payload);
    setModal(null);
    refresh();
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar la rutina "${modal.item.name}" y su historial?`)) return;
    await apiDelete(`/api/routines/${modal.item.id}`);
    setModal(null);
    refresh();
  };

  const done = routines.filter((r) => r.done_today).length;
  const total = routines.length;

  // matriz semanal: últimos 7 días (hoy al final)
  const weekDays = Array.from({ length: 7 }, (_, i) => dayKey(6 - i));
  const logSet = new Set(weekLogs.map((l) => `${l.routine_id}|${l.date}`));

  // promedio semanal
  const last7 = stats?.days.slice(-7) || [];
  const weekPct = last7.length
    ? Math.round(
        (last7.reduce((acc, d) => acc + (d.total ? d.done / d.total : 0), 0) / last7.length) * 100
      )
    : 0;

  return (
    <div className="p-6 md:p-8">
      <TopBar title="Rutinas" subtitle={encouragement(done, total)}>
        <Button onClick={() => setModal({})}>＋ Rutina</Button>
      </TopBar>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          {/* checklist de hoy */}
          <GlassCard className="p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-semibold">Hoy</h2>
              <span className="text-2xl font-bold text-accent">
                {done}
                <span className="text-sm font-medium text-ink-soft">/{total}</span>
              </span>
            </div>
            {routines.length === 0 ? (
              <p className="text-sm text-ink-soft">
                Agrega hábitos diarios: ejercicio, leer, tomar agua, trabajar en tus proyectos…
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {routines.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => toggle(r)}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      r.done_today
                        ? "border-ok/30 bg-ok/5"
                        : "border-glass-border bg-white/50 hover:border-accent/40"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs text-white transition ${
                        r.done_today ? "border-ok bg-ok" : "border-ink/20"
                      }`}
                    >
                      {r.done_today ? "✓" : ""}
                    </span>
                    <span className="text-lg">{r.icon}</span>
                    <span className={`flex-1 text-sm font-medium ${r.done_today ? "text-ink-soft line-through" : ""}`}>
                      {r.name}
                    </span>
                    <span
                      className="text-xs text-ink-soft opacity-0 transition group-hover:opacity-100 hover:!opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModal({ item: r });
                      }}
                    >
                      ✏️
                    </span>
                  </button>
                ))}
              </div>
            )}
          </GlassCard>

          {/* gráfica mensual */}
          <GlassCard className="p-5">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-semibold">Últimos 30 días</h2>
              <span className="text-xs text-ink-soft">% de rutinas completadas por día</span>
            </div>
            {stats && <MonthChart days={stats.days} />}
          </GlassCard>
        </div>

        {/* semana */}
        <div className="flex flex-col gap-4">
          <GlassCard className="p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-semibold">Esta semana</h2>
              <span className="text-lg font-bold text-accent">{weekPct}%</span>
            </div>
            {routines.length === 0 ? (
              <p className="text-sm text-ink-soft">Sin rutinas aún.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_repeat(7,24px)] items-center gap-1 text-[10px] text-ink-soft">
                  <span />
                  {weekDays.map((d) => (
                    <span key={d} className="text-center">
                      {WEEKDAY_SHORT[new Date(`${d}T12:00`).getDay()]}
                    </span>
                  ))}
                </div>
                {routines.map((r) => (
                  <div key={r.id} className="grid grid-cols-[1fr_repeat(7,24px)] items-center gap-1">
                    <span className="truncate text-xs font-medium">
                      {r.icon} {r.name}
                    </span>
                    {weekDays.map((d) => {
                      const hit = logSet.has(`${r.id}|${d}`);
                      return (
                        <span
                          key={d}
                          className={`mx-auto h-4 w-4 rounded ${hit ? "bg-accent" : "bg-ink/8"}`}
                          title={`${d}${hit ? " ✓" : ""}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {last7.length > 0 && (
            <GlassCard className="p-5">
              <h2 className="mb-2 font-semibold">Resumen semanal</h2>
              <div className="flex flex-col gap-1 text-sm">
                {last7.map((d) => (
                  <div key={d.date} className="flex items-center gap-2">
                    <span className="w-20 text-xs text-ink-soft">
                      {new Date(`${d.date}T12:00`).toLocaleDateString("es-MX", { weekday: "short", day: "numeric" })}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${d.total ? (d.done / d.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs text-ink-soft">
                      {d.done}/{d.total}
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.item ? "Editar rutina" : "Nueva rutina"}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Emoji
              <input
                className={`${inputCls} text-center`}
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                maxLength={4}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Nombre
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ejercicio, leer 20 min…"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
            </label>
          </div>
          <div className="flex justify-between gap-2">
            {modal?.item ? (
              <Button variant="danger" onClick={remove}>
                Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={!form.name.trim()}>
                Guardar
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
