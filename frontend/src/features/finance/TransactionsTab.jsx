import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../api/client.js";
import GlassCard from "../../components/ui/GlassCard.jsx";
import Button from "../../components/ui/Button.jsx";
import { fmtMoney, formatDateTime } from "../../lib/constants.js";
import { TransactionModal } from "./FinanceModals.jsx";

const VIEWS = [
  { key: "all", label: "Historial completo" },
  { key: "in_today", label: "Ingresos de hoy" },
  { key: "out_today", label: "Egresos de hoy" },
];

export default function TransactionsTab({ accounts, categories, contexts, contextsById, reload, version }) {
  const [view, setView] = useState("all");
  const [accountFilter, setAccountFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [contextFilter, setContextFilter] = useState("");
  const [txs, setTxs] = useState([]);
  const [goals, setGoals] = useState([]);
  const [modal, setModal] = useState(null); // {tx?} | null

  const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

  const refresh = useCallback(() => {
    const params = new URLSearchParams();
    if (view === "in_today") {
      params.set("type", "ingreso");
      params.set("today", "true");
    } else if (view === "out_today") {
      params.set("type", "egreso");
      params.set("today", "true");
    }
    if (accountFilter) params.set("account_id", accountFilter);
    if (categoryFilter) params.set("category_id", categoryFilter);
    if (contextFilter) params.set("context_id", contextFilter);
    apiGet(`/api/finance/transactions?${params}`).then(setTxs).catch(() => {});
    apiGet("/api/finance/goals").then(setGoals).catch(() => {});
  }, [view, accountFilter, categoryFilter, contextFilter]);

  useEffect(refresh, [refresh, version]);

  const selectCls =
    "rounded-xl border border-glass-border bg-white/70 px-2.5 py-1.5 text-sm outline-none";

  const badge = (tx) => {
    if (tx.type === "ingreso") return <span className="font-semibold text-ok">+{fmtMoney(tx.amount)}</span>;
    if (tx.type === "egreso") return <span className="font-semibold text-err">−{fmtMoney(tx.amount)}</span>;
    return <span className="font-semibold text-accent">⇄ {fmtMoney(tx.amount)}</span>;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              view === v.key ? "bg-accent text-white" : "bg-ink/5 text-ink-soft hover:bg-accent-soft"
            }`}
          >
            {v.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-ink/10" />
        <select className={selectCls} value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
          <option value="">Todas las cuentas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className={selectCls} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <select className={selectCls} value={contextFilter} onChange={(e) => setContextFilter(e.target.value)}>
          <option value="">Todos los contextos</option>
          {contexts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <Button onClick={() => setModal({})}>＋ Transacción</Button>
        </div>
      </div>

      {txs.length === 0 ? (
        <GlassCard className="p-10 text-center text-sm text-ink-soft">
          No hay transacciones con estos filtros.
        </GlassCard>
      ) : (
        <GlassCard className="divide-y divide-ink/5">
          {txs.map((tx) => {
            const acc = accById[tx.account_id];
            const cat = tx.category_id ? catById[tx.category_id] : null;
            const ctx = tx.context_id ? contextsById[tx.context_id] : null;
            const toAcc = tx.to_account_id ? accById[tx.to_account_id] : null;
            const toGoal = tx.to_goal_id ? goals.find((g) => g.id === tx.to_goal_id) : null;
            return (
              <div
                key={tx.id}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-white/60"
                onClick={() => setModal({ tx })}
              >
                <span className="text-lg">{cat?.icon || (tx.type === "transferencia" ? "⇄" : "💸")}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tx.description}</p>
                  <p className="truncate text-xs text-ink-soft">
                    {formatDateTime(tx.occurred_at)}
                    {acc ? ` · ${acc.name}` : ""}
                    {toAcc ? ` → ${toAcc.name}` : ""}
                    {toGoal ? ` → 🎯 ${toGoal.name}` : ""}
                    {cat ? ` · ${cat.name}` : ""}
                    {ctx ? ` · ${ctx.name}` : ""}
                  </p>
                </div>
                {tx.attachment_path && (
                  <a
                    href={tx.attachment_path}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={tx.attachment_name || "comprobante"}
                    className="text-sm"
                  >
                    📎
                  </a>
                )}
                {badge(tx)}
              </div>
            );
          })}
        </GlassCard>
      )}

      <TransactionModal
        open={!!modal}
        tx={modal?.tx}
        accounts={accounts}
        categories={categories}
        contexts={contexts}
        goals={goals}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null);
          refresh();
          reload();
        }}
      />
    </div>
  );
}
