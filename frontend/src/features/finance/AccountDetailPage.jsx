import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import Comprobante, { miniatura } from "../../components/ui/Comprobante.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import TipoBadge from "../../components/ui/TipoBadge.jsx";
import useContexts from "../../hooks/useContexts.js";
import { BASE_CURRENCY, formatDateTime, kindOf } from "../../lib/constants.js";
import CreditoUtilizacion from "./CreditoUtilizacion.jsx";
import FechasTarjeta from "./FechasTarjeta.jsx";
import { AccountModal, TransactionModal } from "./FinanceModals.jsx";
import { BotonPrivacidad, PrivacidadProvider, usePrivacidad } from "./privacidad.jsx";

/** Detalle de UNA cuenta: métricas del periodo y su historial completo.
 *
 *  Los números pesados los calcula el backend (/accounts/{id}/detail): aquí
 *  solo se eligen filtros y se pinta. Las transferencias no inflan ingresos
 *  ni egresos — van aparte — y las recibidas también aparecen en el
 *  historial porque mueven el saldo.
 */

const PERIODOS = [
  { key: "hoy", label: "Hoy" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "ano", label: "Año" },
  { key: "todo", label: "Todo" },
  { key: "custom", label: "Personalizado" },
];

const TIPOS = [
  { key: "", label: "Todos" },
  { key: "ingreso", label: "Ingresos" },
  { key: "egreso", label: "Egresos" },
  { key: "transferencia", label: "Transferencias" },
];

const POR_PAGINA = 50;

function Metrica({ label, value, tone = "" }) {
  return (
    <GlassCard className="p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
    </GlassCard>
  );
}

function Detalle() {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const { money } = usePrivacidad();
  const { contexts, byId: contextsById } = useContexts();

  const [periodo, setPeriodo] = useState("mes");
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const [tipo, setTipo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [data, setData] = useState(null);
  const [txs, setTxs] = useState([]);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // {type: "account"|"tx", data?}

  // catálogos para el modal de edición y para pintar nombres
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [goals, setGoals] = useState([]);
  const [rates, setRates] = useState([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    apiGet("/api/finance/accounts").then(setAccounts).catch(() => {});
    apiGet("/api/finance/categories").then(setCategories).catch(() => {});
    apiGet("/api/finance/goals").then(setGoals).catch(() => {});
    apiGet("/api/finance/rates").then(setRates).catch(() => {});
  }, [version]);

  const url = useCallback(
    (offset) => {
      const params = new URLSearchParams({ period: periodo, limit: POR_PAGINA });
      if (offset) params.set("offset", offset);
      if (periodo === "custom") {
        params.set("from", rango.desde);
        params.set("to", rango.hasta);
      }
      if (tipo) params.set("type", tipo);
      if (categoria) params.set("category_id", categoria);
      return `/api/finance/accounts/${accountId}/detail?${params}`;
    },
    [accountId, periodo, rango, tipo, categoria]
  );

  const refresh = useCallback(() => {
    if (periodo === "custom" && (!rango.desde || !rango.hasta)) return;
    setError(null);
    apiGet(url(0))
      .then((d) => {
        setData(d);
        setTxs(d.transactions);
      })
      .catch((e) => setError(e.message));
  }, [url, periodo, rango]);

  useEffect(refresh, [refresh, version]);

  const cargarMas = async () => {
    setCargandoMas(true);
    try {
      const d = await apiGet(url(txs.length));
      setTxs((prev) => [...prev, ...d.transactions]);
      setData((prev) => ({ ...prev, has_more: d.has_more, total_count: d.total_count }));
    } finally {
      setCargandoMas(false);
    }
  };

  const recargar = () => {
    setModal(null);
    setVersion((v) => v + 1);
  };

  if (error) {
    return (
      <GlassCard className="p-8 text-center text-sm">
        <p className="text-err">{error}</p>
        <Link to="/finanzas" className="mt-2 inline-block text-accent hover:underline">
          ← Volver a Finanzas
        </Link>
      </GlassCard>
    );
  }
  if (!data) return <p className="text-sm text-ink-soft">Cargando…</p>;

  const acc = data.account;
  const t = data.totals;
  const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const selectCls =
    "rounded-xl border border-glass-border bg-surface/70 px-2.5 py-1.5 text-sm outline-none";

  const chips = (lista, actual, setter) => (
    <div className="flex flex-wrap gap-1 rounded-2xl bg-ink/5 p-1">
      {lista.map((v) => (
        <button
          key={v.key}
          onClick={() => setter(v.key)}
          className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
            actual === v.key ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      {/* header de la cuenta */}
      <GlassCard banner={miniatura(acc.banner_path, 640)}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: acc.color }} />
              {acc.name}
              {acc.is_default && <span title="Cuenta predeterminada">⭐</span>}
            </p>
            <p className="text-xs text-ink-soft">
              {kindOf(acc.kind).icon} {kindOf(acc.kind).label}
              {acc.bank ? ` · ${acc.bank}` : ""} · {acc.currency}
              {acc.scope === "negocio" ? " · 💼 Negocio" : ""}
            </p>
            <FechasTarjeta card={acc.card} className="mt-1.5" />
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-soft">Saldo actual</p>
            <p className="text-2xl font-bold">{money(acc.balance, acc.currency)}</p>
            {acc.currency !== BASE_CURRENCY && (
              <p className="text-xs font-medium text-accent">≈ {money(acc.balance_mxn)} MXN</p>
            )}
          </div>
          <button
            className="rounded-xl border border-glass-border bg-surface/60 px-3 py-1.5 text-sm font-medium transition hover:border-accent hover:text-accent"
            onClick={() => setModal({ type: "account" })}
          >
            Editar
          </button>
        </div>
      </GlassCard>

      {/* filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {chips(PERIODOS, periodo, setPeriodo)}
        {periodo === "custom" && (
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
        {chips(TIPOS, tipo, setTipo)}
        <select className={selectCls} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* crédito: límite, utilizado, disponible y utilización — todo lo
          calcula el backend en account.card */}
      {acc.kind === "credito" && acc.card && (
        <GlassCard className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-soft">💳 Crédito</h2>
          <CreditoUtilizacion card={acc.card} currency={acc.currency} />
        </GlassCard>
      )}

      {/* resumen del periodo (las transferencias van aparte a propósito) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Metrica label="Ingresos" value={money(t.ingresos, acc.currency)} tone="text-ok" />
        <Metrica label="Egresos" value={money(t.egresos, acc.currency)} tone="text-err" />
        <Metrica
          label="Flujo neto"
          value={`${t.flujo_neto > 0 ? "+" : ""}${money(t.flujo_neto, acc.currency)}`}
          tone={t.flujo_neto >= 0 ? "text-ok" : "text-err"}
        />
      </div>
      {(t.transferencias_salida > 0 || t.transferencias_entrada > 0) && (
        <p className="text-xs text-ink-soft">
          ⇄ Transferencias del periodo: salieron {money(t.transferencias_salida, acc.currency)} ·
          entraron {money(t.transferencias_entrada, acc.currency)}. No cuentan como ingreso ni
          gasto: solo mueven dinero entre tus cuentas.
        </p>
      )}

      {/* historial */}
      {txs.length === 0 ? (
        <GlassCard className="p-10 text-center text-sm text-ink-soft">
          Sin movimientos en este periodo.
        </GlassCard>
      ) : (
        <GlassCard className="divide-y divide-ink/5">
          {txs.map((tx) => {
            const cat = tx.category_id ? catById[tx.category_id] : null;
            const ctx = tx.context_id ? contextsById[tx.context_id] : null;
            const origen = tx.incoming ? accById[tx.account_id] : null;
            const toAcc = !tx.incoming && tx.to_account_id ? accById[tx.to_account_id] : null;
            const toGoal = tx.to_goal_id ? goals.find((g) => g.id === tx.to_goal_id) : null;
            const monto = tx.incoming ? (tx.amount_in_account ?? tx.amount) : tx.amount;
            return (
              <div
                key={`${tx.id}-${tx.incoming ? "in" : "out"}`}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-surface/60"
                onClick={() => setModal({ type: "tx", data: tx })}
              >
                <TipoBadge type={tx.type} />
                {cat && <span className="text-lg">{cat.icon}</span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tx.description}</p>
                  <p className="truncate text-xs text-ink-soft">
                    {formatDateTime(tx.occurred_at)}
                    {origen ? ` · recibida de ${origen.name}` : ""}
                    {toAcc ? ` → ${toAcc.name}` : ""}
                    {toGoal ? ` → 🎯 ${toGoal.name}` : ""}
                    {cat ? ` · ${cat.name}` : ""}
                    {ctx ? ` · ${ctx.name}` : ""}
                  </p>
                </div>
                {tx.attachment_path && (
                  <Comprobante path={tx.attachment_path} name={tx.attachment_name} />
                )}
                {tx.type === "ingreso" || tx.incoming ? (
                  <span className="font-semibold text-ok">+{money(monto, acc.currency)}</span>
                ) : tx.type === "egreso" ? (
                  <span className="font-semibold text-err">−{money(monto, acc.currency)}</span>
                ) : (
                  <span className="font-semibold text-accent">⇄ {money(monto, acc.currency)}</span>
                )}
              </div>
            );
          })}
          {data.has_more && (
            <button
              onClick={cargarMas}
              disabled={cargandoMas}
              className="w-full px-4 py-2.5 text-xs font-medium text-accent transition hover:bg-surface/60 disabled:opacity-50"
            >
              {cargandoMas ? "Cargando…" : `Cargar más (${txs.length} de ${data.total_count})`}
            </button>
          )}
        </GlassCard>
      )}

      <AccountModal
        open={modal?.type === "account"}
        account={acc}
        onClose={() => setModal(null)}
        onSaved={recargar}
      />
      <TransactionModal
        open={modal?.type === "tx"}
        tx={modal?.type === "tx" ? modal.data : null}
        accounts={accounts}
        categories={categories}
        contexts={contexts}
        goals={goals}
        rates={rates}
        onClose={() => setModal(null)}
        onSaved={recargar}
      />
    </>
  );
}

export default function AccountDetailPage() {
  const navigate = useNavigate();
  return (
    <PrivacidadProvider>
      <div className="p-4 md:p-8">
        <TopBar title="Cuenta">
          <BotonPrivacidad />
        </TopBar>
        <div className="mb-4">
          <button
            onClick={() => navigate("/finanzas")}
            className="text-sm text-accent hover:underline"
          >
            ← Volver a Finanzas
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <Detalle />
        </div>
      </div>
    </PrivacidadProvider>
  );
}
