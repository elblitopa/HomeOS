import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import useContexts from "../../hooks/useContexts.js";
import { formatDateTime } from "../../lib/constants.js";
import EventFormModal from "./EventFormModal.jsx";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function CalendarPage() {
  const { contexts, byId } = useContexts();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11
  const [contextFilter, setContextFilter] = useState(null);
  const [events, setEvents] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [prefillDate, setPrefillDate] = useState(null);

  const refresh = useCallback(() => {
    // rango: mes visible con margen de una semana por lado
    const from = new Date(year, month, -7).toISOString().slice(0, 10);
    const to = new Date(year, month + 1, 8).toISOString().slice(0, 10);
    const params = new URLSearchParams({ from, to });
    if (contextFilter) params.set("context_id", contextFilter);
    apiGet(`/api/events?${params}`).then(setEvents).catch(() => {});
  }, [year, month, contextFilter]);

  useEffect(refresh, [refresh]);

  const eventsByDay = useMemo(() => {
    const map = {};
    for (const ev of events) {
      const key = ev.start.slice(0, 10);
      (map[key] ||= []).push(ev);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    // lunes = 0
    const startOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [year, month]);

  const upcoming = useMemo(
    () =>
      events
        .filter((e) => new Date(e.start) >= new Date(Date.now() - 3600e3))
        .slice(0, 8),
    [events]
  );

  const nav = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const openNew = (date) => {
    setEditing(null);
    setPrefillDate(date || null);
    setModalOpen(true);
  };

  const openEdit = (ev) => {
    setEditing(ev);
    setPrefillDate(null);
    setModalOpen(true);
  };

  const todayKey = dayKey(today);

  return (
    <div className="p-4 md:p-8">
      <TopBar title="Calendario" subtitle={`${events.length} eventos este mes`}>
        <Button onClick={() => openNew()}>＋ Nuevo evento</Button>
      </TopBar>

      <div className="mb-4 flex flex-wrap items-center gap-2">
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

      <GlassCard className="p-4">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-2 text-center text-xs font-semibold text-ink-soft">
              {d}
            </div>
          ))}
          {cells.map((date) => {
            const key = dayKey(date);
            const inMonth = date.getMonth() === month;
            const dayEvents = eventsByDay[key] || [];
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
                  {dayEvents.slice(0, 3).map((ev) => {
                    const ctx = ev.context_id ? byId[ev.context_id] : null;
                    return (
                      <button
                        key={ev.id}
                        className="truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-white"
                        style={{ backgroundColor: ctx?.color || "#2383e2" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(ev);
                        }}
                        title={ev.title}
                      >
                        {!ev.all_day && `${ev.start.slice(11, 16)} `}
                        {ev.title}
                      </button>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span className="px-1 text-[10px] text-ink-soft">
                      +{dayEvents.length - 3} más
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
            {upcoming.map((ev) => {
              const ctx = ev.context_id ? byId[ev.context_id] : null;
              return (
                <GlassCard
                  key={ev.id}
                  className="flex cursor-pointer items-center gap-3 p-3 transition hover:bg-surface/75"
                >
                  <span
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: ctx?.color || "#2383e2" }}
                  />
                  <div className="min-w-0 flex-1" onClick={() => openEdit(ev)}>
                    <p className="truncate font-medium">{ev.title}</p>
                    <p className="text-xs text-ink-soft">
                      {ev.all_day
                        ? new Date(ev.start).toLocaleDateString("es-MX", {
                            weekday: "long",
                            day: "numeric",
                            month: "short",
                          })
                        : formatDateTime(ev.start)}
                      {ctx ? ` · ${ctx.name}` : ""}
                      {ev.reminders?.length ? " · 🔔" : ""}
                    </p>
                  </div>
                </GlassCard>
              );
            })}
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
