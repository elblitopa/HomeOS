import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { fmtMoney, formatDateTime } from "../../lib/constants.js";

/** Pagos a terceros del negocio: lo que debes, a quién, y lo que ya pasó.
 *
 *  Es otra vista de Finanzas filtrada a este negocio, no una caja aparte:
 *  los datos viven en /api/finance y aquí solo se componen tres consultas
 *  (programados pendientes, deudas y últimas transacciones). Registrar una
 *  cuota aquí crea la misma Transaction que registrarla en Finanzas.
 */
export default function PaymentsSection({ contextId, version }) {
  const [programados, setProgramados] = useState([]);
  const [deudas, setDeudas] = useState([]);
  const [txs, setTxs] = useState([]);
  const [providers, setProviders] = useState([]);
  const [ocupado, setOcupado] = useState(null);

  const refresh = useCallback(() => {
    apiGet(`/api/finance/scheduled?context_id=${contextId}&status=pendiente`)
      .then(setProgramados).catch(() => {});
    apiGet(`/api/finance/recurring?context_id=${contextId}`).then(setDeudas).catch(() => {});
    apiGet(`/api/finance/transactions?context_id=${contextId}&limit=20`).then(setTxs).catch(() => {});
    // todos los proveedores, no solo los del negocio: una deuda puede ser con
    // un proveedor general y su nombre tiene que resolverse igual
    apiGet("/api/business/providers").then(setProviders).catch(() => {});
  }, [contextId]);

  useEffect(refresh, [refresh, version]);

  const providerById = useMemo(
    () => Object.fromEntries(providers.map((p) => [p.id, p])),
    [providers]
  );

  // cuanto se le debe a cada proveedor: suma de lo pendiente de sus deudas,
  // en MXN para poder sumar divisas distintas (el backend ya lo convirtio)
  const porProveedor = useMemo(() => {
    const map = {};
    for (const d of deudas) {
      if (d.done || d.type === "ingreso") continue;
      const key = d.provider_id ?? "sin";
      map[key] = (map[key] || 0) + (d.pending_amount_mxn ?? d.pending_amount);
    }
    return Object.entries(map).map(([key, total]) => ({
      nombre: key === "sin" ? "Sin proveedor" : providerById[key]?.name || `Proveedor #${key}`,
      total,
    }));
  }, [deudas, providerById]);

  const pagarCuota = async (d) => {
    const restante = `${d.installments_paid + 1}/${d.installments_total}`;
    if (!confirm(`¿Registrar la cuota ${restante} de "${d.name}" por ${fmtMoney(d.installment_amount)} ${d.currency}?`))
      return;
    setOcupado(d.id);
    try {
      await apiPost(`/api/finance/recurring/${d.id}/pay`);
      refresh();
    } finally {
      setOcupado(null);
    }
  };

  const nadaQueMostrar =
    programados.length === 0 && deudas.length === 0 && txs.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {nadaQueMostrar && (
        <GlassCard className="p-8 text-center text-sm text-ink-soft">
          Nada por aquí todavía. Asigna este negocio a una deuda, un programado o
          una transacción en Finanzas (campo "Negocio / contexto") y aparecerán aquí.
        </GlassCard>
      )}

      {porProveedor.length > 0 && (
        <GlassCard className="p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">
            Debo a cada proveedor
          </p>
          <div className="flex flex-col gap-1">
            {porProveedor.map((p) => (
              <div key={p.nombre} className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{p.nombre}</span>
                <span className="font-semibold text-err">{fmtMoney(p.total)} MXN</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {programados.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
            Programados pendientes
          </p>
          <GlassCard className="divide-y divide-ink/5">
            {programados.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.description}</p>
                  <p className={`text-xs ${p.overdue ? "font-semibold text-err" : "text-ink-soft"}`}>
                    {formatDateTime(p.scheduled_for)}
                    {p.overdue ? " · vencido" : p.due_today ? " · HOY" : ""}
                    {p.provider_id && providerById[p.provider_id]
                      ? ` · ${providerById[p.provider_id].name}`
                      : ""}
                  </p>
                </div>
                <span className={`shrink-0 font-semibold ${p.type === "ingreso" ? "text-ok" : "text-err"}`}>
                  {p.type === "ingreso" ? "+" : "−"}
                  {fmtMoney(p.amount)} {p.currency}
                </span>
              </div>
            ))}
          </GlassCard>
          <p className="mt-1 text-[11px] text-ink-soft">
            Se concretan, aplazan o cancelan desde Finanzas → Programados.
          </p>
        </div>
      )}

      {deudas.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
            Deudas y cobros a plazos
          </p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {deudas.map((d) => (
              <GlassCard key={d.id} className="p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="min-w-0 truncate font-semibold">{d.name}</h3>
                  {d.done && <span className="shrink-0 text-xs text-ok">✓ liquidada</span>}
                </div>
                <p className="text-xs text-ink-soft">
                  {d.provider_id && providerById[d.provider_id]
                    ? `Con ${providerById[d.provider_id].name} · `
                    : ""}
                  {d.type === "ingreso" ? "abono" : "cuota"} {d.installments_paid}/{d.installments_total}
                  {d.next_due ? ` · siguiente ${formatDateTime(d.next_due)}` : ""}
                </p>
                <div className="my-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.round((d.progress || 0) * 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-soft">
                    Pendiente: <b>{fmtMoney(d.pending_amount)} {d.currency}</b>
                  </span>
                  {!d.done && (
                    <Button variant="ghost" onClick={() => pagarCuota(d)} disabled={ocupado === d.id}>
                      {d.type === "ingreso" ? "Registrar abono" : "Registrar cuota"}
                    </Button>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {txs.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">
            Últimas transacciones del negocio
          </p>
          <GlassCard className="divide-y divide-ink/5">
            {txs.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{tx.description}</p>
                  <p className="text-xs text-ink-soft">
                    {formatDateTime(tx.occurred_at)}
                    {tx.provider_id && providerById[tx.provider_id]
                      ? ` · ${providerById[tx.provider_id].name}`
                      : ""}
                  </p>
                </div>
                <span className={`font-semibold ${tx.type === "ingreso" ? "text-ok" : "text-err"}`}>
                  {tx.type === "ingreso" ? "+" : "−"}
                  {fmtMoney(tx.amount)}
                </span>
              </div>
            ))}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
