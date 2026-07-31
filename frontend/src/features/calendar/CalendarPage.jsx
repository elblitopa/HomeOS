import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, apiPut } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import Modal from "../../components/ui/Modal.jsx";
import useContexts from "../../hooks/useContexts.js";
import useDetalleItem from "../../hooks/useDetalleItem.js";
import { COLORES_BASE, dayKey, KIND, KINDS, MOVABLE } from "../../lib/calendarKinds.js";
import { formatDateTime } from "../../lib/constants.js";
import DayView from "./DayView.jsx";
import DetalleItemHost from "./DetalleItemHost.jsx";
import EventFormModal from "./EventFormModal.jsx";

const WEEKDAYS_LUN = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const WEEKDAYS_DOM = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];


export default function CalendarPage() {
  const { contexts, byId } = useContexts();
  const today = new Date();
  const [view, setView] = useState("mes");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [day, setDay] = useState(today);
  const [contextFilter, setContextFilter] = useState(null);
  const [active, setActive] = useState(() => new Set(KINDS.filter((k) => k.on).map((k) => k.key)));
  const [items, setItems] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [prefillDate, setPrefillDate] = useState(null);
  const [weekStart, setWeekStart] = useState("monday");
  const [colors, setColors] = useState(COLORES_BASE);
  const [coloresAbiertos, setColoresAbiertos] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  // hasta que carguen los ajustes no se consulta, para no pedir dos veces
  const [listo, setListo] = useState(false);
  // drag & drop: elemento en el aire y dia sobre el que pasa
  const [dragItem, setDragItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  useEffect(() => {
    apiGet("/api/settings")
      .then((s) => {
        setWeekStart(s.week_starts_on || "monday");
        if (s.calendar_colors) setColors({ ...COLORES_BASE, ...s.calendar_colors });
        if (Array.isArray(s.calendar_kinds)) setActive(new Set(s.calendar_kinds));
      })
      .catch(() => {})
      .finally(() => setListo(true));
    apiGet("/api/google/status")
      .then((s) => setGoogleReady(!!s.connected))
      .catch(() => {});
  }, []);

  const guardarColores = async (nuevos) => {
    setColors(nuevos);
    try {
      await apiPut("/api/settings", { calendar_colors: nuevos });
    } catch {
      /* si falla, al recargar vuelven los guardados */
    }
  };

  const kindsParam = [...active].join(",");

  const refresh = useCallback(() => {
    if (!listo) return;
    if (!kindsParam) return setItems([]);
    let from;
    let to;
    if (view === "dia") {
      const siguiente = new Date(day);
      siguiente.setDate(siguiente.getDate() + 1);
      from = dayKey(day);
      to = dayKey(siguiente);
    } else {
      // el mes visible con margen de una semana por lado
      from = new Date(year, month, -7).toISOString().slice(0, 10);
      to = new Date(year, month + 1, 8).toISOString().slice(0, 10);
    }
    apiGet(`/api/calendar/agenda?from=${from}&to=${to}&kinds=${kindsParam}`)
      .then(setItems)
      .catch(() => {});
  }, [listo, view, day, year, month, kindsParam]);

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
    if (view === "dia") {
      const d = new Date(day);
      d.setDate(d.getDate() + delta);
      setDay(d);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      return;
    }
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const irHoy = () => {
    const ahora = new Date();
    setDay(ahora);
    setYear(ahora.getFullYear());
    setMonth(ahora.getMonth());
  };

  const verDia = (date) => {
    setDay(date);
    setYear(date.getFullYear());
    setMonth(date.getMonth());
    setView("dia");
  };

  const toggleKind = (key) =>
    setActive((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      // se recuerda en el servidor para que sobreviva al recargar
      apiPut("/api/settings", { calendar_kinds: [...next] }).catch(() => {});
      return next;
    });

  const openNew = (date) => {
    setEditing(null);
    setPrefillDate(date || null);
    setModalOpen(true);
  };

  // El detalle y sus acciones viven en un hook compartido con Inicio: las
  // acciones las manda el servidor, asi que duplicarlas seria condenarse a
  // que un boton nuevo funcione en una pagina y en la otra no.
  const detalle = useDetalleItem({
    onRefresh: refresh,
    contextsById: byId,
    colors,
    // el calendario si tiene su propio formulario de eventos
    onEditarEvento: (payload) => {
      setEditing(payload);
      setPrefillDate(null);
      setModalOpen(true);
    },
  });
  const { abrir, colorDe } = detalle;

  // suelta el elemento arrastrado en otro dia: cambia la fecha, conserva la hora
  const soltarEn = async (key, itemArg) => {
    const item = itemArg || dragItem;
    setDragItem(null);
    setDropTarget(null);
    if (!item || item.date.slice(0, 10) === key) return;
    // se pinta en el nuevo dia de inmediato; si el servidor falla, se revierte
    setItems((prev) =>
      prev.map((i) =>
        i.kind === item.kind && i.ref_id === item.ref_id && i.date === item.date
          ? { ...i, date: key + i.date.slice(10) }
          : i
      )
    );
    try {
      await apiPost("/api/calendar/move", {
        kind: item.kind,
        ref_id: String(item.ref_id),
        day: key,
        calendar_id: item.calendar_id || null,
        start: item.kind === "google" ? item.date : null,
        end: item.kind === "google" ? item.end || null : null,
        all_day: !!item.all_day,
      });
    } catch (e) {
      alert(`No se pudo mover: ${e.message}`);
    }
    refresh();
  };

  // ── drag con el dedo (touch) ──────────────────────────────────────────────
  // El drag & drop nativo de HTML no existe en pantallas tactiles, asi que:
  // manten presionado un chip ~medio segundo para "levantarlo" (vibra si el
  // telefono puede), arrastra el fantasma que sigue al dedo y suelta sobre el
  // dia destino. Si el dedo se mueve antes del medio segundo, es scroll normal.
  const touchDrag = useRef(null);

  const cancelarTouch = () => {
    const d = touchDrag.current;
    if (!d) return;
    clearTimeout(d.timer);
    clearInterval(d.autoscroll);
    d.quitar?.();
    d.ghost?.remove();
    touchDrag.current = null;
    setDragItem(null);
    setDropTarget(null);
  };

  const iniciarTouch = (e, item) => {
    if (!MOVABLE.has(item.kind) || touchDrag.current) return;
    const t = e.touches[0];
    const chip = e.currentTarget;
    const d = {
      item,
      chip,
      startX: t.clientX,
      startY: t.clientY,
      active: false,
      timer: setTimeout(() => {
        d.active = true;
        setDragItem(item);
        navigator.vibrate?.(30);
        const rect = chip.getBoundingClientRect();
        const g = chip.cloneNode(true);
        g.style.cssText = `position:fixed;left:0;top:0;width:${rect.width}px;z-index:9999;` +
          "pointer-events:none;opacity:.92;transform-origin:center;box-shadow:0 10px 30px rgba(0,0,0,.35);" +
          `background-color:${getComputedStyle(chip).backgroundColor};border-radius:8px;`;
        document.body.appendChild(g);
        d.ghost = g;
        d.moverGhost = (x, y) => {
          g.style.transform = `translate(${x - rect.width / 2}px, ${y - rect.height - 14}px) scale(1.05)`;
        };
        d.moverGhost(d.startX, d.startY);
        d.lastX = d.startX;
        d.lastY = d.startY;
        // con el scroll bloqueado durante el drag, acercar el dedo al borde
        // superior/inferior desplaza la pagina para alcanzar dias fuera de vista
        d.autoscroll = setInterval(() => {
          const margen = 90;
          let dy = 0;
          if (d.lastY < margen) dy = -14;
          else if (d.lastY > window.innerHeight - margen) dy = 14;
          if (!dy) return;
          window.scrollBy(0, dy);
          const el = document.elementFromPoint(d.lastX, d.lastY);
          const cell = el && el.closest("[data-daykey]");
          setDropTarget(cell ? cell.dataset.daykey : null);
        }, 16);
      }, 450),
    };

    const onMove = (ev) => {
      const tt = ev.touches[0];
      if (!d.active) {
        // se movio antes del long-press: el usuario esta haciendo scroll
        if (Math.abs(tt.clientX - d.startX) > 10 || Math.abs(tt.clientY - d.startY) > 10) cancelarTouch();
        return;
      }
      ev.preventDefault(); // ya esta arrastrando: la pagina no debe hacer scroll
      d.lastX = tt.clientX;
      d.lastY = tt.clientY;
      d.moverGhost(tt.clientX, tt.clientY);
      const el = document.elementFromPoint(tt.clientX, tt.clientY);
      const cell = el && el.closest("[data-daykey]");
      setDropTarget(cell ? cell.dataset.daykey : null);
    };

    const onEnd = (ev) => {
      const activo = d.active;
      if (activo && ev.cancelable) ev.preventDefault(); // evita el click fantasma al soltar
      const tt = ev.changedTouches[0];
      cancelarTouch();
      if (activo && tt) {
        const el = document.elementFromPoint(tt.clientX, tt.clientY);
        const cell = el && el.closest("[data-daykey]");
        if (cell) soltarEn(cell.dataset.daykey, item);
      }
    };

    d.quitar = () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: false });
    document.addEventListener("touchcancel", onEnd);
    touchDrag.current = d;
  };

  const todayKey = dayKey(today);
  const enDia = view === "dia";
  const titulo = enDia
    ? day.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })
    : `${MONTHS[month]} ${year}`;

  return (
    <div className="p-4 md:p-8">
      <TopBar
        title="Calendario"
        subtitle={enDia ? `${visibles.length} este día` : `${delMes} en ${MONTHS[month].toLowerCase()}`}
      >
        <Button onClick={() => openNew(enDia ? `${dayKey(day)}T09:00` : null)}>
          ＋ Nuevo evento
        </Button>
      </TopBar>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-ink/5 p-1">
          {[
            { key: "mes", label: "Mes" },
            { key: "dia", label: "Día" },
          ].map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
                view === v.key ? "bg-surface shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="glass flex items-center gap-1 px-2 py-1">
          <button className="rounded-lg px-2 py-1 hover:bg-ink/5" onClick={() => nav(-1)}>
            ‹
          </button>
          <span className="min-w-44 text-center text-sm font-semibold capitalize">{titulo}</span>
          <button className="rounded-lg px-2 py-1 hover:bg-ink/5" onClick={() => nav(1)}>
            ›
          </button>
        </div>
        <Button variant="ghost" onClick={irHoy}>
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
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {KINDS.filter((k) => k.key !== "google" || googleReady).map((k) => {
          const on = active.has(k.key);
          return (
            <button
              key={k.key}
              onClick={() => toggleKind(k.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                on ? "border-transparent text-white" : "border-glass-border text-ink-soft"
              }`}
              style={on ? { backgroundColor: colors[k.key] } : {}}
              title={on ? `Ocultar ${k.label.toLowerCase()}` : `Mostrar ${k.label.toLowerCase()}`}
            >
              {k.icon} {k.label}
            </button>
          );
        })}
        <button
          onClick={() => setColoresAbiertos(true)}
          className="rounded-full border border-glass-border px-2.5 py-1 text-xs text-ink-soft transition hover:text-ink"
          title="Colores del calendario"
        >
          ⚙️
        </button>
      </div>

      {enDia ? (
        <DayView
          date={day}
          items={visibles}
          colorOf={colorDe}
          kindMeta={KIND}
          onCreate={openNew}
          onOpen={abrir}
        />
      ) : (
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
                  data-daykey={key}
                  className={`min-h-16 cursor-pointer rounded-xl border p-1 transition hover:border-accent/40 hover:bg-accent-soft/40 md:min-h-24 md:p-1.5 ${
                    dropTarget === key && dragItem
                      ? "border-accent bg-accent-soft/60"
                      : "border-transparent"
                  } ${inMonth ? "" : "opacity-35"}`}
                  onClick={() => openNew(key)}
                  onDragOver={(e) => {
                    if (!dragItem) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dropTarget !== key) setDropTarget(key);
                  }}
                  onDragLeave={() => {
                    if (dropTarget === key) setDropTarget(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    soltarEn(key);
                  }}
                >
                  <button
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition hover:bg-accent/20 ${
                      key === todayKey ? "bg-accent text-white" : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      verDia(date);
                    }}
                    title="Ver el día"
                  >
                    {date.getDate()}
                  </button>
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {delDia.slice(0, 3).map((item, i) => (
                      <button
                        key={`${item.kind}-${item.ref_id}-${i}`}
                        className={`truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-white ${
                          item.done ? "line-through opacity-60" : ""
                        } ${
                          MOVABLE.has(item.kind)
                            ? "cursor-grab select-none active:cursor-grabbing [-webkit-touch-callout:none]"
                            : ""
                        } ${dragItem === item ? "opacity-40" : ""}`}
                        style={{ backgroundColor: colorDe(item) }}
                        draggable={MOVABLE.has(item.kind)}
                        onDragStart={(e) => {
                          setDragItem(item);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragItem(null);
                          setDropTarget(null);
                        }}
                        onTouchStart={(e) => iniciarTouch(e, item)}
                        onClick={(e) => {
                          e.stopPropagation();
                          abrir(item);
                        }}
                        title={`${KIND[item.kind]?.label}: ${item.title}${
                          item.detail ? ` · ${item.detail}` : ""
                        }${MOVABLE.has(item.kind) ? " — arrástralo a otro día para moverlo" : ""}`}
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
      )}

      {!enDia && upcoming.length > 0 && (
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
                  className="min-w-0 flex-1 cursor-pointer"
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
        googleReady={googleReady}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          refresh();
        }}
      />

      <DetalleItemHost {...detalle.hostProps} contextos={contexts} />

      <Modal
        open={coloresAbiertos}
        onClose={() => setColoresAbiertos(false)}
        title="Colores del calendario"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">
            El color de cada tipo aplica a sus bloques en el mes y en el día.
          </p>
          {KINDS.map((k) => (
            <label key={k.key} className="flex items-center gap-3 text-sm font-medium">
              <input
                type="color"
                value={colors[k.key] || COLORES_BASE[k.key]}
                onChange={(e) => guardarColores({ ...colors, [k.key]: e.target.value })}
                className="h-9 w-14 cursor-pointer rounded-lg border border-glass-border bg-transparent"
              />
              <span className="flex-1">
                {k.icon} {k.label}
              </span>
              <span className="text-xs text-ink-soft">{colors[k.key]}</span>
            </label>
          ))}
          <div className="flex justify-between gap-2 pt-1">
            <Button variant="ghost" onClick={() => guardarColores(COLORES_BASE)}>
              Restaurar
            </Button>
            <Button onClick={() => setColoresAbiertos(false)}>Listo</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
