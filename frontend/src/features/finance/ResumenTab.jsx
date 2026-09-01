import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../api/client.js";
import useCardSort from "../../hooks/useCardSort.js";
import Button from "../../components/ui/Button.jsx";
import Carousel from "../../components/ui/Carousel.jsx";
import { miniatura } from "../../components/ui/Comprobante.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { COLOR_TIPO, IconoTipo } from "../../components/ui/TipoBadge.jsx";
import { BASE_CURRENCY, fmtMoney, kindOf, PERIODS } from "../../lib/constants.js";
import {
  AccountModal,
  AjusteModal,
  GoalModal,
  LoanModal,
  RecurringModal,
  SubscriptionModal,
  CobrarModal,
  ConcretarModal,
  TransactionModal,
} from "./FinanceModals.jsx";

const periodLabel = (v) => PERIODS.find((p) => p.value === v)?.label || v;

/** El borde y el fondo avisan qué tan cerca está el cobro, para verlo de
 *  reojo sin leer: naranja en la última semana, rojo el mismo día o vencido. */
// exportada para que Inicio pinte las suscripciones próximas con EXACTAMENTE
// los mismos umbrales y colores que aquí (una sola definición de urgencia)
export function urgencia(diasRestantes) {
  if (diasRestantes === null || diasRestantes === undefined) return "border-glass-border bg-surface/50";
  if (diasRestantes <= 0) return "border-err/40 bg-err/10";
  if (diasRestantes <= 7) return "border-amber-500/40 bg-amber-500/10";
  return "border-glass-border bg-surface/50";
}

function ProgressBar({ value, color = "#2383e2" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, value * 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function ResumenTab({ accounts, categories, contexts, reload, version, goTab }) {
  const [goals, setGoals] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [subs, setSubs] = useState([]);
  const [rates, setRates] = useState([]);
  const [today, setToday] = useState({ ingresos: 0, egresos: 0 });
  const [programados, setProgramados] = useState([]);
  const [modal, setModal] = useState(null); // {type, data?}

  useEffect(() => {
    apiGet("/api/finance/goals").then(setGoals).catch(() => {});
    apiGet("/api/finance/recurring").then(setRecurring).catch(() => {});
    apiGet("/api/finance/subscriptions").then(setSubs).catch(() => {});
    apiGet("/api/finance/rates").then(setRates).catch(() => {});
    apiGet("/api/finance/summary").then((s) => setToday(s.today)).catch(() => {});
    apiGet("/api/finance/scheduled?status=pendiente").then(setProgramados).catch(() => {});
  }, [version]);

  // en el resumen solo asoman los que ya tocan; el resto vive en su pestaña
  const porAtender = programados.filter((p) => p.overdue || p.due_today);

  // el carrusel solo muestra lo que falta por lograr; las completadas viven
  // en "Ver todas", celebradas como Completada (jamás como vencidas)
  const metasPendientes = goals.filter((g) => !g.completed);

  const close = () => setModal(null);
  const saved = () => {
    close();
    reload();
  };
  // el registro pasa por un modal: si el cargo viene en otra divisa hay que
  // poder decir cuánto cobraron de verdad, porque PayPal no usa el tipo de
  // cambio del mercado sino el suyo, con su margen ya adentro
  const payRecurring = (item) => setModal({ type: "cobrar", data: item, kind: "pago" });
  const paySub = (item) => setModal({ type: "cobrar", data: item, kind: "suscripcion" });

  // orden de las tarjetas: viene del servidor y se puede reacomodar arrastrando
  const [order, setOrder] = useState([]);

  useEffect(() => {
    const ids = accounts.map((a) => a.id);
    setOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [accounts]);

  const ordered = useMemo(() => {
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return order.map((id) => byId.get(id)).filter(Boolean);
  }, [accounts, order]);

  const { draggingId, handleProps } = useCardSort({
    order,
    onReorder: setOrder,
    onCommit: (ids) => apiPost("/api/finance/accounts/reorder", { ids }).catch(() => {}),
  });

  // Secciones: primero las cuentas de negocio (sin importar su tipo) y
  // despues las personales agrupadas por tipo de cuenta.
  const sections = [];
  const negocio = ordered.filter((a) => a.scope === "negocio");
  if (negocio.length) {
    sections.push({ key: "negocio", icon: "💼", label: "Negocio", items: negocio });
  }
  // las personales se agrupan por tipo, respetando el orden en que aparecen
  const porTipo = new Map();
  for (const a of ordered) {
    if (a.scope === "negocio") continue;
    if (!porTipo.has(a.kind)) porTipo.set(a.kind, []);
    porTipo.get(a.kind).push(a);
  }
  for (const [kind, items] of porTipo) {
    sections.push({ key: kind, icon: kindOf(kind).icon, label: kindOf(kind).label, items });
  }

  const totalMxn = accounts.reduce((sum, a) => sum + (a.balance_mxn ?? a.balance ?? 0), 0);
  const hasForeign = accounts.some((a) => a.currency !== BASE_CURRENCY);

  // los tres movimientos van en su propia fila, solo con el símbolo y el color
  // del tipo: son los botones de todos los días y así se pican sin leer. Usan
  // el mismo icono que el badge de las filas para que sea el mismo idioma.
  const movimientos = [
    { tipo: "ingreso", titulo: "Nuevo ingreso", hover: "hover:bg-ok/25" },
    { tipo: "transferencia", titulo: "Nueva transferencia", hover: "hover:bg-accent/25" },
    { tipo: "egreso", titulo: "Nuevo egreso", hover: "hover:bg-err/25" },
  ];

  const quick = [
    { label: "🗓️ Programado", action: () => setModal({ type: "tx", programado: true }) },
    { label: "🏦 Cuenta", action: () => setModal({ type: "account" }) },
    { label: "🎯 Meta", action: () => setModal({ type: "goal" }) },
    { label: "📆 Recurrentes", action: () => setModal({ type: "recurring" }) },
    { label: "🔁 Suscripción", action: () => setModal({ type: "sub" }) },
    { label: "🤝 Préstamo", action: () => setModal({ type: "loan" }) },
    { label: "🔄 Actualizar", action: () => setModal({ type: "ajuste" }) },
  ];

  return (
    // filas: la primera se ajusta a la navegación rápida y la segunda
    // absorbe el alto sobrante, para que no quede hueco entre las tarjetas
    <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:grid-rows-[auto_1fr]">
      {/* navegación rápida: hasta arriba en móvil, columna derecha en escritorio */}
      <GlassCard className="p-4 lg:col-start-2 lg:row-start-1 lg:self-start">
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">Navegación rápida</h2>
        <div className="mb-2 grid grid-cols-3 gap-2">
          {movimientos.map((m) => (
            <button
              key={m.tipo}
              onClick={() => setModal({ type: "tx", txType: m.tipo })}
              title={m.titulo}
              aria-label={m.titulo}
              className={`flex items-center justify-center rounded-xl border py-3 backdrop-blur transition ${
                COLOR_TIPO[m.tipo]
              } ${m.hover}`}
            >
              <IconoTipo type={m.tipo} className="h-6 w-6" />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {quick.map((q) => (
            <button
              key={q.label}
              onClick={q.action}
              className="rounded-xl border border-glass-border bg-surface/60 px-2 py-2 text-sm font-medium transition hover:border-accent hover:text-accent"
            >
              {q.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* columna principal: cuentas */}
      <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-1 lg:row-span-2">
        {accounts.length > 0 && (
          <GlassCard className="p-4">
            <p className="text-xs text-ink-soft">
              Total de todas tus cuentas{hasForeign ? " (convertido a MXN)" : ""}
            </p>
            <p className="text-2xl font-bold">{fmtMoney(totalMxn)}</p>
          </GlassCard>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <GlassCard className="p-4">
            <p className="text-xs text-ink-soft">Hoy · Ingresos</p>
            <p className="text-lg font-bold text-ok">{fmtMoney(today.ingresos)}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-xs text-ink-soft">Hoy · Egresos</p>
            <p className="text-lg font-bold text-err">{fmtMoney(today.egresos)}</p>
          </GlassCard>
          <GlassCard className="p-4 max-md:col-span-2">
            <p className="text-xs text-ink-soft">Hoy · Balance</p>
            <p className="text-lg font-bold">{fmtMoney(today.ingresos - today.egresos)}</p>
          </GlassCard>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-soft">Cuentas</h2>
            <Button variant="ghost" onClick={() => setModal({ type: "account" })}>
              ＋ Cuenta
            </Button>
          </div>
          {accounts.length === 0 ? (
            <GlassCard className="p-8 text-center text-sm text-ink-soft">
              Crea tu primera cuenta (efectivo, débito, crédito…) para empezar a registrar movimientos.
            </GlassCard>
          ) : (
            <div className="flex flex-col gap-4">
              {sections.map((section) => (
                <div key={section.key}>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
                    {section.icon} {section.label}
                  </p>
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                    {section.items.map((a) => (
                      <GlassCard
                        key={a.id}
                        banner={miniatura(a.banner_path, 640)}
                        data-sort-id={a.id}
                        data-sort-group={section.key}
                        className={`relative cursor-pointer transition hover:bg-surface/75 ${
                          draggingId === String(a.id)
                            ? "scale-[0.98] opacity-60 ring-2 ring-accent"
                            : ""
                        }`}
                      >
                        <button
                          {...handleProps(a.id, section.key)}
                          className="absolute right-1.5 top-1.5 z-10 rounded-lg bg-surface/70 px-1.5 py-0.5 text-xs text-ink-soft backdrop-blur transition hover:text-ink"
                          title="Arrastra para acomodar"
                        >
                          ⠿
                        </button>
                        <div className="p-4" onClick={() => setModal({ type: "account", data: a })}>
                          <div className="mb-2 flex items-center justify-between">
                            <span className="flex items-center gap-2 font-medium">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                              {a.name}
                              {a.is_default && (
                                <span title="Cuenta predeterminada" className="text-xs">
                                  ⭐
                                </span>
                              )}
                            </span>
                            <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] uppercase text-ink-soft">
                              {section.key === "negocio" ? kindOf(a.kind).label : a.scope}
                            </span>
                          </div>
                          <p className="text-xl font-bold">{fmtMoney(a.balance, a.currency)}</p>
                          {a.currency !== BASE_CURRENCY && (
                            <p className="text-xs font-medium text-accent">
                              ≈ {fmtMoney(a.balance_mxn)} MXN
                            </p>
                          )}
                          <p className="text-xs text-ink-soft">
                            {a.bank ? `${a.bank} · ` : ""}
                            {a.currency}
                          </p>
                        </div>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* metas, deudas y suscripciones */}
      {/* min-w-0: sin esto el carrusel de metas estira la columna del grid
          hasta el ancho de todas sus tarjetas y desborda la pantalla */}
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-2 lg:self-start">
        {/* solo aparece cuando hay algo que atender hoy o vencido */}
        {porAtender.length > 0 && (
          <GlassCard className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-soft">⏳ Programados</h2>
              <span className="text-xs text-ink-soft">
                {porAtender.length} por confirmar
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {porAtender.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-xl border border-glass-border bg-surface/50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.description}</p>
                    <p className={`text-xs ${p.overdue ? "font-medium text-err" : "text-ink-soft"}`}>
                      {p.overdue
                        ? `venció hace ${Math.abs(p.days_left)} d`
                        : "es hoy"}{" "}
                      ·{" "}
                      <span className={p.type === "ingreso" ? "text-ok" : "text-err"}>
                        {p.type === "ingreso" ? "+" : "−"}
                        {fmtMoney(p.amount, p.currency)}
                      </span>
                    </p>
                  </div>
                  <button
                    className="shrink-0 rounded-lg bg-ok/10 px-2 py-1 text-xs font-medium text-ok transition hover:bg-ok/20"
                    onClick={() => setModal({ type: "concretar", data: p })}
                  >
                    ✓
                  </button>
                </div>
              ))}
              {porAtender.length > 4 && (
                <p className="text-xs text-ink-soft">
                  y {porAtender.length - 4} más en la pestaña Programados.
                </p>
              )}
            </div>
          </GlassCard>
        )}

        <GlassCard className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-soft">🎯 Metas</h2>
            <div className="flex items-center gap-3">
              {goals.length > 0 && (
                <button
                  className="text-xs font-medium text-ink-soft transition hover:text-accent"
                  onClick={() => goTab?.("metas")}
                >
                  Ver todas ({goals.length}) →
                </button>
              )}
              <button className="text-sm text-accent" onClick={() => setModal({ type: "goal" })}>
                ＋
              </button>
            </div>
          </div>
          {metasPendientes.length === 0 ? (
            <p className="text-xs text-ink-soft">
              {goals.length === 0
                ? "Sin metas todavía."
                : "Todas tus metas están completadas 🎉"}
            </p>
          ) : (
            <Carousel>
              {metasPendientes.map((g) => (
                <div
                  key={g.id}
                  className="w-[85%] shrink-0 cursor-pointer snap-start overflow-hidden rounded-xl border border-glass-border bg-surface/50 transition hover:border-accent/40"
                  onClick={() => setModal({ type: "goal", data: g })}
                >
                  {g.banner_path ? (
                    <div
                      className="h-24 w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${miniatura(g.banner_path, 640)})` }}
                    />
                  ) : (
                    <div className="h-24 w-full bg-gradient-to-br from-accent/25 to-accent/5" />
                  )}
                  <div className="p-3">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium">{g.name}</p>
                      {g.deadline && (
                        <p
                          className={`shrink-0 text-xs ${
                            g.days_left < 0 ? "font-medium text-err" : "text-ink-soft"
                          }`}
                        >
                          {g.days_left < 0
                            ? `venció hace ${Math.abs(g.days_left)} d`
                            : g.days_left === 0
                              ? "vence hoy"
                              : `faltan ${g.days_left} d`}
                        </p>
                      )}
                    </div>
                    <ProgressBar value={g.progress} />
                    <p className="mt-1 text-xs text-ink-soft">
                      {fmtMoney(g.saved_amount)} de {fmtMoney(g.target_amount)} ({Math.round(g.progress * 100)}%)
                    </p>
                  </div>
                </div>
              ))}
            </Carousel>
          )}
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-soft">📆 Pagos recurrentes</h2>
            <button className="text-sm text-accent" onClick={() => setModal({ type: "recurring" })}>
              ＋
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {recurring.length === 0 && (
              <p className="text-xs text-ink-soft">Sin deudas ni cobros a plazos 🎉</p>
            )}
            {recurring.map((r) => {
              const cobro = r.type === "ingreso";
              return (
                <div
                  key={r.id}
                  className={`rounded-xl border p-3 backdrop-blur transition ${
                    r.done ? "border-glass-border bg-surface/50" : urgencia(r.next_due ? r.days_left : null)
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <p className="cursor-pointer text-sm font-medium" onClick={() => setModal({ type: "recurring", data: r })}>
                      {cobro && <span className="mr-1">📥</span>}
                      {r.name}
                    </p>
                    <span className="text-xs text-ink-soft">
                      {r.installments_paid}/{r.installments_total}
                    </span>
                  </div>
                  <ProgressBar value={r.progress} color={r.done ? "#2f9e44" : cobro ? "#2f9e44" : "#2383e2"} />
                  <p className="mt-1 text-xs text-ink-soft">
                    {cobro ? "Recibido" : "Pagado"} {fmtMoney(r.paid_amount, r.currency)} · Falta{" "}
                    {fmtMoney(r.pending_amount, r.currency)}
                  </p>
                  {r.currency !== BASE_CURRENCY && (
                    <p className="text-xs font-medium text-accent">
                      {cobro ? "Abono" : "Cuota"} {fmtMoney(r.installment_amount, r.currency)} ≈{" "}
                      {fmtMoney(r.installment_amount_mxn)} MXN
                    </p>
                  )}
                  {!r.done && (
                    <div className="mt-1.5 flex items-center justify-between">
                      <p className="text-xs text-ink-soft">
                        {r.next_due
                          ? r.days_left < 0
                            ? `⚠️ atrasado ${Math.abs(r.days_left)} d`
                            : r.days_left === 0
                              ? "⚠️ es hoy"
                              : `siguiente en ${r.days_left} día${r.days_left > 1 ? "s" : ""}`
                          : "sin fecha"}
                      </p>
                      <button
                        className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold backdrop-blur transition ${
                          cobro
                            ? "border-ok/30 bg-ok/15 text-ok hover:bg-ok/25"
                            : "border-accent/30 bg-accent/15 text-accent hover:bg-accent/25"
                        }`}
                        onClick={() => payRecurring(r)}
                        title={`Registrar ${cobro ? "el abono" : "el pago"} de ${r.name}`}
                      >
                        {cobro ? "Registrar abono" : "Registrar pago"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-soft">🔁 Suscripciones</h2>
            <button className="text-sm text-accent" onClick={() => setModal({ type: "sub" })}>
              ＋
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {subs.length === 0 && <p className="text-xs text-ink-soft">Sin suscripciones.</p>}
            {subs.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 backdrop-blur transition ${urgencia(
                  s.next_due ? s.days_left : null
                )}`}
              >
                <div className="min-w-0 cursor-pointer" onClick={() => setModal({ type: "sub", data: s })}>
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-ink-soft">
                    {fmtMoney(s.amount, s.currency)} · {periodLabel(s.period)}
                    {s.next_due &&
                      ` · ${
                        s.days_left < 0
                          ? `⚠️ atrasado ${Math.abs(s.days_left)} d`
                          : s.days_left === 0
                            ? "⚠️ hoy"
                            : `en ${s.days_left} día${s.days_left > 1 ? "s" : ""}`
                      }`}
                  </p>
                  {s.currency !== BASE_CURRENCY && (
                    <p className="text-xs font-medium text-accent">
                      ≈ {fmtMoney(s.amount_mxn)} MXN
                    </p>
                  )}
                </div>
                <button
                  className="shrink-0 rounded-lg border border-accent/30 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent backdrop-blur transition hover:bg-accent/25"
                  onClick={() => paySub(s)}
                  title={`Registrar el cobro de ${s.name}`}
                >
                  Cobrado
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* modales */}
      <AccountModal open={modal?.type === "account"} account={modal?.data} onClose={close} onSaved={saved} />
      <TransactionModal
        open={modal?.type === "tx"}
        type={modal?.txType}
        sched={modal?.sched}
        programadoDefault={!!modal?.programado}
        rates={rates}
        accounts={accounts}
        categories={categories}
        contexts={contexts}
        goals={goals}
        onClose={close}
        onSaved={saved}
      />
      <ConcretarModal
        open={modal?.type === "concretar"}
        item={modal?.data}
        cuentas={accounts}
        tasas={rates}
        onClose={close}
        onSaved={saved}
      />
      <CobrarModal
        open={modal?.type === "cobrar"}
        item={modal?.data}
        kind={modal?.kind}
        cuentas={accounts}
        tasas={rates}
        onClose={close}
        onSaved={saved}
      />
      <GoalModal open={modal?.type === "goal"} goal={modal?.data} onClose={close} onSaved={saved} />
      <AjusteModal open={modal?.type === "ajuste"} accounts={accounts} onClose={close} onSaved={saved} />
      <LoanModal open={modal?.type === "loan"} accounts={accounts} onClose={close} onSaved={saved} />
      <RecurringModal
        open={modal?.type === "recurring"}
        item={modal?.data}
        accounts={accounts}
        categories={categories}
        contexts={contexts}
        rates={rates}
        onClose={close}
        onSaved={saved}
      />
      <SubscriptionModal
        open={modal?.type === "sub"}
        item={modal?.data}
        accounts={accounts}
        categories={categories}
        rates={rates}
        onClose={close}
        onSaved={saved}
      />
    </div>
  );
}
