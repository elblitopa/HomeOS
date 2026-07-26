import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { BASE_CURRENCY, fmtMoney, kindOf, PERIODS } from "../../lib/constants.js";
import {
  AccountModal,
  GoalModal,
  RecurringModal,
  SubscriptionModal,
  TransactionModal,
} from "./FinanceModals.jsx";

const periodLabel = (v) => PERIODS.find((p) => p.value === v)?.label || v;

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

export default function ResumenTab({ accounts, categories, contexts, reload, version }) {
  const [goals, setGoals] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [subs, setSubs] = useState([]);
  const [today, setToday] = useState({ ingresos: 0, egresos: 0 });
  const [modal, setModal] = useState(null); // {type, data?}

  useEffect(() => {
    apiGet("/api/finance/goals").then(setGoals).catch(() => {});
    apiGet("/api/finance/recurring").then(setRecurring).catch(() => {});
    apiGet("/api/finance/subscriptions").then(setSubs).catch(() => {});
    apiGet("/api/finance/summary").then((s) => setToday(s.today)).catch(() => {});
  }, [version]);

  const close = () => setModal(null);
  const saved = () => {
    close();
    reload();
  };

  const payRecurring = async (item) => {
    if (!confirm(`¿Registrar pago de ${fmtMoney(item.installment_amount)} de "${item.name}"?`)) return;
    await apiPost(`/api/finance/recurring/${item.id}/pay`);
    reload();
  };

  const paySub = async (item) => {
    if (!confirm(`¿Registrar cobro de ${fmtMoney(item.amount)} de "${item.name}"?`)) return;
    await apiPost(`/api/finance/subscriptions/${item.id}/pay`);
    reload();
  };

  // agrupar cuentas por tipo
  const groups = {};
  for (const a of accounts) (groups[a.kind] ||= []).push(a);

  const totalMxn = accounts.reduce((sum, a) => sum + (a.balance_mxn ?? a.balance ?? 0), 0);
  const hasForeign = accounts.some((a) => a.currency !== BASE_CURRENCY);

  const quick = [
    { label: "＋ Ingreso", action: () => setModal({ type: "tx", txType: "ingreso" }) },
    { label: "− Egreso", action: () => setModal({ type: "tx", txType: "egreso" }) },
    { label: "⇄ Transferencia", action: () => setModal({ type: "tx", txType: "transferencia" }) },
    { label: "🏦 Cuenta", action: () => setModal({ type: "account" }) },
    { label: "🎯 Meta", action: () => setModal({ type: "goal" }) },
    { label: "📆 Deuda", action: () => setModal({ type: "recurring" }) },
    { label: "🔁 Suscripción", action: () => setModal({ type: "sub" }) },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* columna principal: cuentas */}
      <div className="flex flex-col gap-6">
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
              {Object.entries(groups).map(([kind, accs]) => (
                <div key={kind}>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
                    {kindOf(kind).icon} {kindOf(kind).label}
                  </p>
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                    {accs.map((a) => (
                      <GlassCard
                        key={a.id}
                        banner={a.banner_path}
                        className="cursor-pointer transition hover:bg-surface/75"
                      >
                        <div className="p-4" onClick={() => setModal({ type: "account", data: a })}>
                          <div className="mb-2 flex items-center justify-between">
                            <span className="flex items-center gap-2 font-medium">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                              {a.name}
                            </span>
                            <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] uppercase text-ink-soft">
                              {a.scope}
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

      {/* navegación rápida */}
      <div className="flex flex-col gap-4">
        <GlassCard className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-soft">Navegación rápida</h2>
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

        <GlassCard className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-soft">🎯 Metas</h2>
            <button className="text-sm text-accent" onClick={() => setModal({ type: "goal" })}>
              ＋
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {goals.length === 0 && <p className="text-xs text-ink-soft">Sin metas todavía.</p>}
            {goals.map((g) => (
              <div key={g.id} className="cursor-pointer" onClick={() => setModal({ type: "goal", data: g })}>
                <div className="mb-1 flex items-baseline justify-between">
                  <p className="text-sm font-medium">{g.name}</p>
                  <p className="text-xs text-ink-soft">{periodLabel(g.period)}</p>
                </div>
                <ProgressBar value={g.progress} />
                <p className="mt-1 text-xs text-ink-soft">
                  {fmtMoney(g.saved_amount)} de {fmtMoney(g.target_amount)} ({Math.round(g.progress * 100)}%)
                </p>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-soft">📆 Pagos recurrentes</h2>
            <button className="text-sm text-accent" onClick={() => setModal({ type: "recurring" })}>
              ＋
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {recurring.length === 0 && <p className="text-xs text-ink-soft">Sin deudas registradas 🎉</p>}
            {recurring.map((r) => (
              <div key={r.id} className="rounded-xl border border-glass-border bg-surface/50 p-3">
                <div className="flex items-baseline justify-between">
                  <p className="cursor-pointer text-sm font-medium" onClick={() => setModal({ type: "recurring", data: r })}>
                    {r.name}
                  </p>
                  <span className="text-xs text-ink-soft">
                    {r.installments_paid}/{r.installments_total}
                  </span>
                </div>
                <ProgressBar value={r.progress} color={r.done ? "#2f9e44" : "#2383e2"} />
                <p className="mt-1 text-xs text-ink-soft">
                  Pagado {fmtMoney(r.paid_amount)} · Pendiente {fmtMoney(r.pending_amount)}
                </p>
                {!r.done && (
                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="text-xs text-ink-soft">
                      {r.next_due
                        ? r.days_left <= 0
                          ? "⚠️ vence hoy"
                          : `siguiente en ${r.days_left} día${r.days_left > 1 ? "s" : ""}`
                        : "sin fecha"}
                    </p>
                    <button className="text-xs font-medium text-accent" onClick={() => payRecurring(r)}>
                      Registrar pago
                    </button>
                  </div>
                )}
              </div>
            ))}
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
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-glass-border bg-surface/50 p-2.5">
                <div className="cursor-pointer" onClick={() => setModal({ type: "sub", data: s })}>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-ink-soft">
                    {fmtMoney(s.amount)} · {periodLabel(s.period)}
                    {s.next_due &&
                      ` · ${s.days_left <= 0 ? "⚠️ hoy" : `en ${s.days_left} día${s.days_left > 1 ? "s" : ""}`}`}
                  </p>
                </div>
                <button className="text-xs font-medium text-accent" onClick={() => paySub(s)}>
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
        accounts={accounts}
        categories={categories}
        contexts={contexts}
        goals={goals}
        onClose={close}
        onSaved={saved}
      />
      <GoalModal open={modal?.type === "goal"} goal={modal?.data} onClose={close} onSaved={saved} />
      <RecurringModal
        open={modal?.type === "recurring"}
        item={modal?.data}
        accounts={accounts}
        categories={categories}
        onClose={close}
        onSaved={saved}
      />
      <SubscriptionModal
        open={modal?.type === "sub"}
        item={modal?.data}
        accounts={accounts}
        categories={categories}
        onClose={close}
        onSaved={saved}
      />
    </div>
  );
}
