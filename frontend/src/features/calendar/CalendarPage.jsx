import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import useContexts from "../../hooks/useContexts.js";
import { formatDateTime } from "../../lib/constants.js";
import EventFormModal from "./EventFormModal.jsx";

const WEEKDAYS_LUN = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const WEEKDAYS_DOM = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// que se muestra en el calendario y como. Las transacciones son muchas,
// asi que empiezan apagadas para no saturar la vista.
const KINDS = [
  { key: "evento", label: "Eventos", icon: "📅", color: "#2383e2", on: true },
  { key: "tarea", label: "Tareas", icon: "✅", color: "#0ca678", on: true },
  { key: "suscripcion", label: "Suscripciones", icon: "🔁", color: "#9c36b5", on: true },
  { key: "pago", label: "Pagos", icon: "📆", color: "#e8590c", on: true },
  { key: "meta", label: "Metas", icon: "🎯", color: "#f59e0b", on: true },
  { key: "nota", label: "Notas", icon: "📝", color: "#6b6b70", on: true },
  { key: "transaccion", label: "Transacciones", icon: "💸", color: "#3b5bdb", on: false },
];

const KIND = Object.fromEntries(KINDS.map((k) => [k.key, k]));
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function CalendarPage() {
  const { contexts, byId } = useContexts();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [contextFilter, setContextFilter] = useState(null);
  const [active, setActive] = useState(() => new Set(KINDS.filter((k) => k.on).map((k) => k.key)));
  const [items, setItems] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [prefillDate, setPrefillDate] = useState(null);
  const [weekStart, setWeekStart] = useState("monday");

  useEffect(() => {
    apiGet("/api/settings")
      .then((s) => setWeekStart(s.week_starts_on || "monday"))
      .catch(() => {});
  }, []);

  const kindsParam = [...active].join(",");

  const refresh = useCallback(() => {
    if (!kindsParam) return setItems([]);
    // rango: el mes visible con margen de una semana por lado
    const from = new Date(year, month, -7).toISOString().slice(0, 10);
    const to = new Date(year, month + 1, 8).toISOString().slice(0, 10);
    apiGet(`/api/calendar/agenda?from=${from}&to=${to}&kinds=${kindsParam}`)
      .then(setItems)
      .catch(() => {});
  }, [year, month, kindsParam]);

  useEffect(refresh, [refresh]);

  const visibles = useMemo(
    () => (contextFilter ? items.filter((i) => i.context_id === contextFilter) : items),
    [items, contextFilter]
  );

  const porDia = useMemo(() => {
    const map = {};
    for (const item of visibles) (map[item.date.slice(0, 10)] ||= []).push(item);
    return map;
  }, [visibles]);

  const domingoPrimero = weekStart === "sunday";
  const weekdays = domingoPrimero ? WEEKDAYS_DOM : WEEKDAYS_LUN;

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    // getDay(): 0 = domingo. Con semana en lunes hay que recorrer un lugar.
    const startOffset = domingoPrimero ? first.getDay() : (first.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [year, month, domingoPrimero]);

  const upcoming = useMemo(
    () => visibles.filter((i) => new Date(i.date) >= new Date(Date.now() - 3600e3)).slice(0, 10),
    [visibles]
  );

  // el rango traido incluye una semana de margen; el conteo es solo del mes
  const delMes = useMemo(
    () => visibles.filter((i) => Number(i.date.slice(5, 7)) === month + 1).length,
    [visibles, month]
  );

  const nav = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const toggleKind = (key) =>
    setActive((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const openNew = (date) => {
    setEditing(null);
    setPrefillDate(date || null);
    setModalOpen(true);
  };

  const abrir = (item) => {
    // solo los eventos se editan desde aqui; lo demas vive en su propia sección
    if (item.kind !== "evento") return;
    apiGet(`/api/events?from=${item.date.slice(0, 10)}&to=${item.date.slice(0, 10)}T23:59`)
      .then((list) => {
        const found = list.find((e) => e.id === item.ref_id);
        if (found) {
          setEditing(found);
          setPrefillDate(null);
          setModalOpen(true);
        }
      })
      .catch(() => {});
  };

  const colorDe = (item) =>
    (item.context_id && byId[item.context_id]?.color) || KIND[item.kind]?.color || "#2383e2";

  const todayKey = dayKey(today);

  return (
    <div className="p-4 md:p-8">
      <TopBar title="Calendario" subtitle={`${delMes} en ${MONTHS[month].toLowerCase()}`}>
        <Button onClick={() => openNew()}>＋ Nuevo evento</Button>
      </TopBar>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="glass flex items-center gap-1 px-2 py-1">
          <button className="rounded-lg px-2 py-1 hover:bg-ink/5" onClick={() => nav(-1)}>
            ‹
          </button>
          <span className="min-w-36 text-center text-sm font-semibold">
            {MONTHS[month]} {year}
          </span>
          <button className="rounded-lg px-2 py-1 hover:bg-ink/5" onClick={() => nav(1)}>
            ›
          </button>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setYear(today.getFullYear());
            setMonth(today.getMonth());
          }}
        >
          Hoy
        </Button>
        <span className="mx-1 h-4 w-px bg-ink/10" />
        <button
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            !contextFilter ? "bg-accent text-white" : "bg-ink/5 text-ink-soft"
          }`}
          onClick={() => setContextFilter(null)}
        >
          General
        </button>
        {contexts.map((c) => (
          <button
            key={c.id}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              contextFilter === c.id ? "text-white" : "bg-ink/5 text-ink-soft"
            }`}
            style={contextFilter === c.id ? { backgroundColor: c.color } : {}}
            onClick={() => setContextFilter(contextFilter === c.id ? null : c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* que tipos de cosas se ven */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {KINDS.map((k) => {
          const on = active.has(k.key);
          return (
            <button
              key={k.key}
              onClick={() => toggleKind(k.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                on ? "border-transparent text-white" : "border-glass-border text-ink-soft"
              }`}
              style={on ? { backgroundColor: k.color } : {}}
              title={on ? `Ocultar ${k.label.toLowerCase()}` : `Mostrar ${k.label.toLowerCase()}`}
            >
              {k.icon} {k.label}
            </button>
          );
        })}
      </div>

      <GlassCard className="p-4">
        <div className="grid grid-cols-7 gap-1">
          {weekdays.map((d) => (
            <div key={d} className="pb-2 text-center text-xs font-semibold text-ink-soft">
              {d}
            </div>
          ))}
          {cells.map((date) => {
            const key = dayKey(date);
            const inMonth = date.getMonth() === month;
            const delDia = porDia[key] || [];
            return (
              <div
                key={key}
                className={`min-h-16 cursor-pointer rounded-xl border border-transparent p-1 transition hover:border-accent/40 hover:bg-accent-soft/40 md:min-h-24 md:p-1.5 ${
                  inMonth ? "" : "opacity-35"
                }`}
                onClick={() => openNew(key)}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    key === todayKey ? "bg-accent text-white" : ""
                  }`}
                >
                  {date.getDate()}
                </span>
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {delDia.slice(0, 3).map((item, i) => (
                    <button
                      key={`${item.kind}-${item.ref_id}-${i}`}
                      className={`truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-white ${
                        item.done ? "line-through opacity-60" : ""
                      }`}
                      style={{ backgroundColor: colorDe(item) }}
                      onClick={(e) => {
                        e.stopPropagation();
                        abrir(item);
                      }}
                      title={`${KIND[item.kind]?.label}: ${item.title}${
                        item.detail ? ` · ${item.detail}` : ""
                      }`}
                    >
                      {KIND[item.kind]?.icon} {item.title}
                    </button>
                  ))}
                  {delDia.length > 3 && (
                    <span className="px-1 text-[10px] text-ink-soft">
                      +{delDia.length - 3} más
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {upcoming.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-soft">Próximos</h2>
          <div className="flex flex-col gap-2">
            {upcoming.map((item, i) => (
              <GlassCard
                key={`${item.kind}-${item.ref_id}-${i}`}
                className="flex items-center gap-3 p-3"
              >
                <span
                  className="h-8 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorDe(item) }}
                />
                <div
                  className={`min-w-0 flex-1 ${item.kind === "evento" ? "cursor-pointer" : ""}`}
                  onClick={() => abrir(item)}
                >
                  <p className={`truncate font-medium ${item.done ? "line-through opacity-60" : ""}`}>
                    {KIND[item.kind]?.icon} {item.title}
                  </p>
                  <p className="truncate text-xs text-ink-soft">
                    {item.all_day
                      ? new Date(item.date).toLocaleDateString("es-MX", {
                          weekday: "long",
                          day: "numeric",
                          month: "short",
                        })
                      : formatDateTime(item.date)}
                    {item.detail ? ` · ${item.detail}` : ""}
                    {item.context_id && byId[item.context_id]
                      ? ` · ${byId[item.context_id].name}`
                      : ""}
                  </p>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      <EventFormModal
        open={modalOpen}
        event={editing}
        prefillDate={prefillDate}
        contexts={contexts}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          refresh();
        }}
      />
    </div>
  );
}
