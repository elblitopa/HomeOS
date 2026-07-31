import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import Comprobante from "../../components/ui/Comprobante.jsx";
import TipoBadge from "../../components/ui/TipoBadge.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { fmtMoney, formatDateTime } from "../../lib/constants.js";
import { AplazarModal, ConcretarModal, TransactionModal } from "./FinanceModals.jsx";

const VISTAS = [
  { key: "pendiente", label: "Pendientes" },
  { key: "concretado", label: "Concretados" },
  { key: "cancelado", label: "Cancelados" },
  { key: "all", label: "Todos" },
];

function textoVencimiento(item) {
  if (item.status === "concretado") return "concretado";
  if (item.status === "cancelado") return "no se concretó";
  const d = item.days_left;
  if (d < 0) return `venció hace ${Math.abs(d)} d`;
  if (d === 0) return "es hoy";
  if (d === 1) return "es mañana";
  return `faltan ${d} d`;
}

export default function ScheduledTab({ accounts, categories, contexts, contextsById, reload, version }) {
  const [vista, setVista] = useState("pendiente");
  const [items, setItems] = useState([]);
  const [goals, setGoals] = useState([]);
  const [rates, setRates] = useState([]);
  const [modal, setModal] = useState(null); // {tipo, item?}

  const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

  const refresh = useCallback(() => {
    apiGet(`/api/finance/scheduled?status=${vista}`).then(setItems).catch(() => {});
    apiGet("/api/finance/goals").then(setGoals).catch(() => {});
    apiGet("/api/finance/rates").then(setRates).catch(() => {});
  }, [vista]);

  useEffect(refresh, [refresh, version]);

  const guardado = () => {
    setModal(null);
    refresh();
    reload(); // los saldos cambian al concretar
  };

  const cancelar = async (item) => {
    if (!confirm(`¿Marcar "${item.description}" como no concretado?\n\nSe queda en el historial, no se borra.`))
      return;
    await apiPost(`/api/finance/scheduled/${item.id}/cancel`);
    guardado();
  };

  const reabrir = async (item) => {
    await apiPost(`/api/finance/scheduled/${item.id}/reopen`);
    guardado();
  };

  const borrar = async (item) => {
    const aviso = item.transaction_id
      ? "\n\nLa transacción que ya generó NO se borra."
      : "";
    if (!confirm(`¿Eliminar el programado "${item.description}"?${aviso}`)) return;
    await apiDelete(`/api/finance/scheduled/${item.id}`);
    guardado();
  };

  const monto = (item) => {
    const texto = fmtMoney(item.actual_amount ?? item.amount, item.currency);
    if (item.type === "ingreso") return <span className="font-semibold text-ok">+{texto}</span>;
    if (item.type === "egreso") return <span className="font-semibold text-err">−{texto}</span>;
    return <span className="font-semibold text-accent">⇄ {texto}</span>;
  };

  // los pendientes se agrupan por urgencia; el historial va de corrido
  const pendientes = items.filter((i) => i.status === "pendiente");
  const grupos =
    vista === "pendiente"
      ? [
          { key: "vencidos", titulo: "⚠️ Vencidos", items: pendientes.filter((i) => i.overdue) },
          { key: "hoy", titulo: "Hoy", items: pendientes.filter((i) => i.due_today) },
          {
            key: "proximos",
            titulo: "Próximos",
            items: pendientes.filter((i) => !i.overdue && !i.due_today),
          },
        ].filter((g) => g.items.length > 0)
      : [{ key: "todos", titulo: null, items }];

  const Fila = ({ item }) => {
    const acc = accById[item.account_id];
    const cat = item.category_id ? catById[item.category_id] : null;
    const ctx = item.context_id ? contextsById[item.context_id] : null;
    const toAcc = item.to_account_id ? accById[item.to_account_id] : null;
    const toGoal = item.to_goal_id ? goals.find((g) => g.id === item.to_goal_id) : null;
    const pendiente = item.status === "pendiente";

    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition hover:bg-surface/60">
        <TipoBadge type={item.type} />
        {cat && <span className="text-lg">{cat.icon}</span>}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {item.description}
            {item.postponed_count > 0 && pendiente && (
              <span className="ml-1.5 text-xs font-normal text-ink-soft">
                · aplazado {item.postponed_count}×
              </span>
            )}
          </p>
          <p className="truncate text-xs text-ink-soft">
            <span className={item.overdue ? "font-medium text-err" : ""}>
              {formatDateTime(item.scheduled_for)} · {textoVencimiento(item)}
            </span>
            {acc ? ` · ${acc.name}` : ""}
            {toAcc ? ` → ${toAcc.name}` : ""}
            {toGoal ? ` → 🎯 ${toGoal.name}` : ""}
            {cat ? ` · ${cat.name}` : ""}
            {ctx ? ` · ${ctx.name}` : ""}
            {item.note ? ` · ${item.note}` : ""}
          </p>
        </div>

        {item.attachment_path && (
          <Comprobante path={item.attachment_path} name={item.attachment_name} />
        )}

        {monto(item)}

        <div className="flex shrink-0 gap-1">
          {pendiente ? (
            <>
              <button
                onClick={() => setModal({ tipo: "concretar", item })}
                className="rounded-lg bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok transition hover:bg-ok/20"
                title="Se concretó: crea la transacción real"
              >
                ✓ Concretar
              </button>
              <button
                onClick={() => setModal({ tipo: "aplazar", item })}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:bg-ink/5 hover:text-ink"
                title="Mover a otra fecha"
              >
                📅 Aplazar
              </button>
              <button
                onClick={() => setModal({ tipo: "editar", item })}
                className="rounded-lg px-2 py-1 text-xs text-ink-soft transition hover:bg-ink/5"
                title="Editar"
              >
                ✏️
              </button>
              <button
                onClick={() => cancelar(item)}
                className="rounded-lg px-2 py-1 text-xs text-ink-soft transition hover:bg-err/10 hover:text-err"
                title="No se concretó"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  item.status === "concretado" ? "bg-ok/10 text-ok" : "bg-ink/5 text-ink-soft"
                }`}
              >
                {item.status === "concretado" ? "✓ concretado" : "no llegó"}
              </span>
              {(item.status === "cancelado" || !item.transaction_id) && (
                <button
                  onClick={() => reabrir(item)}
                  className="rounded-lg px-2 py-1 text-xs text-ink-soft transition hover:bg-ink/5 hover:text-ink"
                  title="Volver a dejarlo pendiente"
                >
                  ↩︎
                </button>
              )}
              <button
                onClick={() => borrar(item)}
                className="rounded-lg px-2 py-1 text-xs text-ink-soft transition hover:bg-err/10 hover:text-err"
                title="Eliminar del historial"
              >
                🗑
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {VISTAS.map((v) => (
          <button
            key={v.key}
            onClick={() => setVista(v.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              vista === v.key ? "bg-accent text-white" : "bg-ink/5 text-ink-soft hover:bg-accent-soft"
            }`}
          >
            {v.label}
          </button>
        ))}
        <div className="ml-auto">
          <Button onClick={() => setModal({ tipo: "nuevo" })}>＋ Programado</Button>
        </div>
      </div>

      {items.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-2 p-10 text-center">
          <span className="text-3xl">🗓️</span>
          <p className="text-sm font-medium">
            {vista === "pendiente" ? "No tienes nada programado" : "Nada por aquí"}
          </p>
          <p className="text-sm text-ink-soft">
            Anota los ingresos y egresos que sabes que llegarán. No tocan tus saldos hasta que
            marques que se concretaron.
          </p>
        </GlassCard>
      ) : (
        grupos.map((g) => (
          <div key={g.key} className="flex flex-col gap-2">
            {g.titulo && (
              <h3 className="px-1 text-sm font-semibold text-ink-soft">
                {g.titulo}
                <span className="ml-1.5 font-normal">({g.items.length})</span>
              </h3>
            )}
            <GlassCard className="divide-y divide-ink/5">
              {g.items.map((item) => (
                <Fila key={item.id} item={item} />
              ))}
            </GlassCard>
          </div>
        ))
      )}

      <ConcretarModal
        open={modal?.tipo === "concretar"}
        item={modal?.item}
        cuentas={accounts}
        tasas={rates}
        onClose={() => setModal(null)}
        onSaved={guardado}
      />
      <AplazarModal
        open={modal?.tipo === "aplazar"}
        item={modal?.item}
        onClose={() => setModal(null)}
        onSaved={guardado}
      />
      <TransactionModal
        open={modal?.tipo === "nuevo" || modal?.tipo === "editar"}
        sched={modal?.tipo === "editar" ? modal.item : null}
        programadoDefault
        rates={rates}
        accounts={accounts}
        categories={categories}
        contexts={contexts}
        goals={goals}
        onClose={() => setModal(null)}
        onSaved={guardado}
      />
    </div>
  );
}
