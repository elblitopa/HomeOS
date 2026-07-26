import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import {
  BASE_CURRENCY,
  CRYPTOS,
  CURRENCIES,
  fmtRate,
  formatDateTime,
} from "../../lib/constants.js";
import { inputCls } from "../todos/TaskFormModal.jsx";
import ConverterCard from "./ConverterCard.jsx";

function RateCard({ rate, accounts, onEdit, onAuto, onRemove, editing, setEditing, onSave, busy }) {
  const isBase = rate.code === BASE_CURRENCY;
  const isCrypto = rate.kind === "cripto";
  const cuentas = accounts.filter((a) => a.currency === rate.code).length;
  const meta = CRYPTOS.find((c) => c.code === rate.code);

  return (
    <GlassCard className="p-4">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {isCrypto && "₿ "}
            {rate.code}
          </h3>
          <p className="text-[11px] text-ink-soft">
            {isBase
              ? "Divisa base"
              : rate.manual
                ? "Precio manual"
                : meta?.name || "Automático"}
            {cuentas > 0 && ` · ${cuentas} cuenta${cuentas > 1 ? "s" : ""}`}
          </p>
        </div>
        {!isBase && (
          <button
            className="text-xs text-ink-soft transition hover:text-err"
            onClick={() => onRemove(rate.code)}
            title="Quitar"
          >
            ✕
          </button>
        )}
      </div>

      {editing?.code === rate.code ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="any"
            className={inputCls}
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && onSave(rate.code)}
          />
          <Button onClick={() => onSave(rate.code)} disabled={busy}>
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
              ${fmtRate(rate.rate_to_mxn)}
              <span className="ml-1 text-xs font-normal text-ink-soft">
                MXN por 1 {rate.code}
              </span>
            </>
          )}
        </p>
      )}

      <p className="mt-1 text-[11px] text-ink-soft">
        {isBase ? "Siempre vale 1" : `Actualizado ${formatDateTime(rate.updated_at)}`}
      </p>

      {!isBase && editing?.code !== rate.code && (
        <div className="mt-2 flex gap-2">
          <button
            className="text-xs font-medium text-accent hover:underline"
            onClick={() => onEdit(rate)}
          >
            Fijar manual
          </button>
          {rate.manual && (
            <button
              className="text-xs font-medium text-ink-soft hover:underline"
              onClick={() => onAuto(rate.code)}
            >
              Volver a automático
            </button>
          )}
        </div>
      )}
    </GlassCard>
  );
}

export default function DivisasPage() {
  const [rates, setRates] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [newFiat, setNewFiat] = useState("USD");
  const [newCrypto, setNewCrypto] = useState("BTC");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(null);

  const refresh = useCallback(() => {
    apiGet("/api/finance/rates").then(setRates).catch(() => {});
    apiGet("/api/finance/accounts").then(setAccounts).catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  const have = new Set(rates.map((r) => r.code));
  const fiat = rates.filter((r) => r.kind !== "cripto");
  const crypto = rates.filter((r) => r.kind === "cripto");
  const availableFiat = CURRENCIES.filter((c) => !have.has(c));
  const availableCrypto = CRYPTOS.filter((c) => !have.has(c.code));

  const run = async (fn) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const addFiat = () =>
    run(() => apiPost("/api/finance/rates", { code: newFiat, kind: "fiat" }));

  const addCrypto = () => {
    const meta = CRYPTOS.find((c) => c.code === newCrypto);
    return run(() =>
      apiPost("/api/finance/rates", {
        code: meta.code,
        kind: "cripto",
        api_id: meta.id,
      })
    );
  };

  const refreshNow = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiPost("/api/finance/rates/refresh");
      setRates(res.rates || []);
      setMsg(
        res.updated
          ? { ok: true, text: `Actualizados ${res.updated} precio(s).` }
          : { ok: false, text: `Sin cambios: ${res.skipped || "nada que actualizar"}.` }
      );
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const saveManual = (code) => {
    const value = Number(editing.value);
    if (!value || value <= 0) return;
    return run(async () => {
      await apiPut(`/api/finance/rates/${code}`, { rate_to_mxn: value, manual: true });
      setEditing(null);
    });
  };

  const backToAuto = (code) =>
    run(() => apiPut(`/api/finance/rates/${code}`, { manual: false }));

  const remove = (code) => {
    if (!confirm(`¿Quitar ${code} de tu lista?`)) return;
    return run(() => apiDelete(`/api/finance/rates/${code}`));
  };

  const cardProps = {
    accounts,
    editing,
    setEditing,
    busy,
    onEdit: (r) => setEditing({ code: r.code, value: r.rate_to_mxn }),
    onAuto: backToAuto,
    onRemove: remove,
    onSave: saveManual,
  };

  return (
    <div className="p-4 md:p-8">
      <TopBar
        title="Divisas"
        subtitle={`${fiat.length} moneda(s) y ${crypto.length} cripto`}
      >
        <Button variant="ghost" onClick={refreshNow} disabled={busy}>
          {busy ? "…" : "🔄 Actualizar precios"}
        </Button>
      </TopBar>

      <div className="flex flex-col gap-6">
        <ConverterCard rates={rates} />

        {msg && (
          <p className={`text-sm ${msg.ok ? "text-ok" : "text-err"}`}>{msg.text}</p>
        )}

        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-soft">Monedas</h2>
            <select
              className={`${inputCls} !w-28`}
              value={newFiat}
              onChange={(e) => setNewFiat(e.target.value)}
            >
              {availableFiat.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Button onClick={addFiat} disabled={busy || !availableFiat.length}>
              ＋ Agregar
            </Button>
          </div>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
            {fiat.map((r) => (
              <RateCard key={r.code} rate={r} {...cardProps} />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-soft">Criptomonedas</h2>
            <select
              className={`${inputCls} !w-44`}
              value={newCrypto}
              onChange={(e) => setNewCrypto(e.target.value)}
            >
              {availableCrypto.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
            <Button onClick={addCrypto} disabled={busy || !availableCrypto.length}>
              ＋ Agregar
            </Button>
          </div>
          {crypto.length === 0 ? (
            <GlassCard className="p-6 text-center text-sm text-ink-soft">
              Agrega Bitcoin, Ethereum o cualquier cripto para ver su precio en pesos y
              usarla en la calculadora.
            </GlassCard>
          ) : (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
              {crypto.map((r) => (
                <RateCard key={r.code} rate={r} {...cardProps} />
              ))}
            </div>
          )}
        </section>

        <p className="text-xs text-ink-soft">
          Los precios se actualizan solos una vez al día. Si tu banco o tu exchange te da
          otro precio, fíjalo manualmente y HomeOS respetará el tuyo. Las transacciones ya
          registradas conservan el tipo de cambio del día en que ocurrieron.
        </p>
      </div>
    </div>
  );
}
