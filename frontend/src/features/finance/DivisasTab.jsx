import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { BASE_CURRENCY, CURRENCIES, fmtMoney, formatDateTime } from "../../lib/constants.js";
import { inputCls } from "../todos/TaskFormModal.jsx";

export default function DivisasTab({ accounts, reload, version }) {
  const [rates, setRates] = useState([]);
  const [newCode, setNewCode] = useState("USD");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(null); // {code, value}

  const refresh = useCallback(() => {
    apiGet("/api/finance/rates").then(setRates).catch(() => {});
  }, []);

  useEffect(refresh, [refresh, version]);

  const already = new Set(rates.map((r) => r.code));
  const available = CURRENCIES.filter((c) => !already.has(c));

  const usage = (code) => accounts.filter((a) => a.currency === code).length;

  const addCurrency = async () => {
    if (!newCode) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiPost("/api/finance/rates", { code: newCode });
      refresh();
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const refreshNow = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiPost("/api/finance/rates/refresh");
      setRates(res.rates || []);
      setMsg(
        res.updated
          ? { ok: true, text: `Actualizadas ${res.updated} divisa(s).` }
          : { ok: false, text: `Sin cambios: ${res.skipped || "nada que actualizar"}.` }
      );
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const saveManual = async (code) => {
    const value = Number(editing.value);
    if (!value || value <= 0) return;
    setBusy(true);
    try {
      await apiPut(`/api/finance/rates/${code}`, { rate_to_mxn: value, manual: true });
      setEditing(null);
      refresh();
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const backToAuto = async (code) => {
    setBusy(true);
    try {
      await apiPut(`/api/finance/rates/${code}`, { manual: false });
      refresh();
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (code) => {
    if (!confirm(`¿Quitar ${code} de tus divisas?`)) return;
    try {
      await apiDelete(`/api/finance/rates/${code}`);
      refresh();
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={`${inputCls} !w-32`}
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
        >
          {available.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button onClick={addCurrency} disabled={busy || !available.length}>
          ＋ Agregar divisa
        </Button>
        <Button variant="ghost" onClick={refreshNow} disabled={busy}>
          {busy ? "…" : "🔄 Actualizar ahora"}
        </Button>
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-ok" : "text-err"}`}>{msg.text}</span>
        )}
      </div>

      <p className="text-xs text-ink-soft">
        Los tipos de cambio se actualizan solos una vez al día. Si tu banco te da otro
        precio, fíjalo manualmente y HomeOS respetará el tuyo. Las transacciones ya
        registradas conservan el tipo de cambio del día en que ocurrieron.
      </p>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {rates.map((r) => {
          const isBase = r.code === BASE_CURRENCY;
          const cuentas = usage(r.code);
          return (
            <GlassCard key={r.code} className="p-4">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{r.code}</h3>
                  <p className="text-[11px] text-ink-soft">
                    {isBase
                      ? "Divisa base"
                      : r.manual
                        ? "Tipo de cambio manual"
                        : "Automático"}
                    {cuentas > 0 && ` · ${cuentas} cuenta${cuentas > 1 ? "s" : ""}`}
                  </p>
                </div>
                {!isBase && (
                  <button
                    className="text-xs text-ink-soft transition hover:text-err"
                    onClick={() => remove(r.code)}
                    title="Quitar divisa"
                  >
                    ✕
                  </button>
                )}
              </div>

              {editing?.code === r.code ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.0001"
                    className={inputCls}
                    value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && saveManual(r.code)}
                  />
                  <Button onClick={() => saveManual(r.code)} disabled={busy}>
                    ✓
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>
                    ✕
                  </Button>
                </div>
              ) : (
                <p className="text-xl font-bold">
                  {isBase ? (
                    <span className="text-ink-soft">1.00</span>
                  ) : (
                    <>
                      {fmtMoney(r.rate_to_mxn)}
                      <span className="ml-1 text-xs font-normal text-ink-soft">
                        por 1 {r.code}
                      </span>
                    </>
                  )}
                </p>
              )}

              <p className="mt-1 text-[11px] text-ink-soft">
                {isBase ? "Siempre vale 1" : `Actualizado ${formatDateTime(r.updated_at)}`}
              </p>

              {!isBase && editing?.code !== r.code && (
                <div className="mt-2 flex gap-2">
                  <button
                    className="text-xs font-medium text-accent hover:underline"
                    onClick={() => setEditing({ code: r.code, value: r.rate_to_mxn })}
                  >
                    Fijar manual
                  </button>
                  {r.manual && (
                    <button
                      className="text-xs font-medium text-ink-soft hover:underline"
                      onClick={() => backToAuto(r.code)}
                    >
                      Volver a automático
                    </button>
                  )}
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
