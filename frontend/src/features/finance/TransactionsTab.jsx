import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../api/client.js";
import Comprobante from "../../components/ui/Comprobante.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import Button from "../../components/ui/Button.jsx";
import TipoBadge from "../../components/ui/TipoBadge.jsx";
import { dayKey } from "../../lib/calendarKinds.js";
import { fmtMoney, formatDateTime } from "../../lib/constants.js";
import { TransactionModal } from "./FinanceModals.jsx";

// antes los chips mezclaban tipo y fecha ("ingresos de hoy"); ahora el tipo
// va en chips y el periodo en su propio filtro, que combinados cubren lo mismo
const TIPOS = [
  { key: "", label: "Todo" },
  { key: "ingreso", label: "Ingresos" },
  { key: "egreso", label: "Egresos" },
  { key: "transferencia", label: "Transferencias" },
];

const PERIODOS = [
  { key: "todo", label: "Todo el historial" },
  { key: "hoy", label: "Hoy" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mes" },
  { key: "mes-elegir", label: "Elegir mes…" },
  { key: "rango", label: "Rango de fechas…" },
];

/** El lunes (o domingo, según ajustes) de la semana en curso. */
function inicioSemana(weekStart) {
  const d = new Date();
  const dia = d.getDay(); // 0 = domingo
  const atras = weekStart === "sunday" ? dia : (dia + 6) % 7;
  d.setDate(d.getDate() - atras);
  return d;
}

const sumaDias = (d, n) => {
  const copia = new Date(d);
  copia.setDate(copia.getDate() + n);
  return copia;
};

export default function TransactionsTab({ accounts, categories, contexts, contextsById, reload, version }) {
  const [tipo, setTipo] = useState("");
  const [periodo, setPeriodo] = useState("todo");
  const [mesElegido, setMesElegido] = useState(""); // "2026-07"
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const [weekStart, setWeekStart] = useState("monday");
  const [accountFilter, setAccountFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [contextFilter, setContextFilter] = useState("");
  const [txs, setTxs] = useState([]);
  const [goals, setGoals] = useState([]);
  const [rates, setRates] = useState([]);
  const [modal, setModal] = useState(null); // {tx?} | null

  const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

  useEffect(() => {
    // para que "esta semana" empiece el mismo día que el calendario
    apiGet("/api/settings")
      .then((s) => setWeekStart(s.week_starts_on || "monday"))
      .catch(() => {});
  }, []);

  const refresh = useCallback(() => {
    const params = new URLSearchParams();
    if (tipo) params.set("type", tipo);

    if (periodo === "hoy") {
      params.set("today", "true");
    } else if (periodo === "semana") {
      const inicio = inicioSemana(weekStart);
      params.set("from", dayKey(inicio));
      params.set("to", dayKey(sumaDias(inicio, 7)));
    } else if (periodo === "mes") {
      params.set("month", dayKey(new Date()).slice(0, 7));
    } else if (periodo === "mes-elegir") {
      if (!mesElegido) return; // hasta que elija un mes no hay qué pedir
      params.set("month", mesElegido);
    } else if (periodo === "rango") {
      if (!rango.desde || !rango.hasta) return;
      params.set("from", rango.desde);
      // el servidor excluye el tope, pero el usuario elige días inclusivos
      params.set("to", dayKey(sumaDias(new Date(`${rango.hasta}T12:00`), 1)));
    }

    if (accountFilter) params.set("account_id", accountFilter);
    if (categoryFilter) params.set("category_id", categoryFilter);
    if (contextFilter) params.set("context_id", contextFilter);
    apiGet(`/api/finance/transactions?${params}`).then(setTxs).catch(() => {});
    apiGet("/api/finance/goals").then(setGoals).catch(() => {});
    // por si se marca como programado, que puede llevar otra divisa
    apiGet("/api/finance/rates").then(setRates).catch(() => {});
  }, [tipo, periodo, mesElegido, rango, weekStart, accountFilter, categoryFilter, contextFilter]);

  useEffect(refresh, [refresh, version]);

  const selectCls =
    "rounded-xl border border-glass-border bg-surface/70 px-2.5 py-1.5 text-sm outline-none";

  const badge = (tx) => {
    if (tx.type === "ingreso") return <span className="font-semibold text-ok">+{fmtMoney(tx.amount)}</span>;
    if (tx.type === "egreso") return <span className="font-semibold text-err">−{fmtMoney(tx.amount)}</span>;
    return <span className="font-semibold text-accent">⇄ {fmtMoney(tx.amount)}</span>;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {TIPOS.map((v) => (
          <button
            key={v.key}
            onClick={() => setTipo(v.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              tipo === v.key ? "bg-accent text-white" : "bg-ink/5 text-ink-soft hover:bg-accent-soft"
            }`}
          >
            {v.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-ink/10" />
        <select className={selectCls} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
          {PERIODOS.map((p) => (
            <option key={p.key} value={p.key}>
              📅 {p.label}
            </option>
          ))}
        </select>
        {periodo === "mes-elegir" && (
          <input
            type="month"
            className={selectCls}
            value={mesElegido}
            onChange={(e) => setMesElegido(e.target.value)}
          />
        )}
        {periodo === "rango" && (
          <>
            <input
              type="date"
              className={selectCls}
              value={rango.desde}
              onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
            />
            <span className="text-xs text-ink-soft">a</span>
            <input
              type="date"
              className={selectCls}
              value={rango.hasta}
              onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
            />
          </>
        )}
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
                className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-surface/60"
                onClick={() => setModal({ tx })}
              >
                <TipoBadge type={tx.type} />
                {cat && <span className="text-lg">{cat.icon}</span>}
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
                  <Comprobante path={tx.attachment_path} name={tx.attachment_name} />
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
        rates={rates}
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
