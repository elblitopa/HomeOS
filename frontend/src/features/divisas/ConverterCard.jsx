import { useEffect, useState } from "react";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { BASE_CURRENCY, fmtRate } from "../../lib/constants.js";
import { inputCls } from "../todos/TaskFormModal.jsx";

/** Calculadora: convierte usando los tipos de cambio guardados.
 *  Todo pasa por MXN: monto → MXN → divisa destino. */
export default function ConverterCard({ rates }) {
  const [amount, setAmount] = useState("1");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState(BASE_CURRENCY);

  const codes = rates.map((r) => r.code);
  const rateOf = (code) => rates.find((r) => r.code === code)?.rate_to_mxn || 0;

  // si se elimina una divisa que estaba seleccionada, caer a algo válido
  useEffect(() => {
    if (codes.length && !codes.includes(from)) setFrom(codes[0]);
    if (codes.length && !codes.includes(to)) setTo(BASE_CURRENCY);
  }, [codes.join(","), from, to]);

  const fromRate = rateOf(from);
  const toRate = rateOf(to);
  const value = Number(amount);
  const ready = fromRate > 0 && toRate > 0 && Number.isFinite(value);
  const result = ready ? (value * fromRate) / toRate : 0;
  const unit = ready ? fromRate / toRate : 0;

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const selectCls = `${inputCls} !w-auto min-w-24`;

  return (
    <GlassCard className="p-5">
      <h2 className="mb-3 font-semibold">🧮 Calculadora de cambio</h2>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Monto
          <input
            type="number"
            step="any"
            className={`${inputCls} !w-36`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          De
          <select className={selectCls} value={from} onChange={(e) => setFrom(e.target.value)}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={swap}
          className="mb-1 rounded-xl px-2.5 py-2 text-lg transition hover:bg-ink/5"
          title="Invertir"
        >
          ⇄
        </button>
        <label className="flex flex-col gap-1 text-sm font-medium">
          A
          <select className={selectCls} value={to} onChange={(e) => setTo(e.target.value)}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-xl bg-accent-soft p-4">
        {ready ? (
          <>
            <p className="text-2xl font-bold text-accent">
              {fmtRate(result)} <span className="text-base font-medium">{to}</span>
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              1 {from} = {fmtRate(unit)} {to}
              {unit > 0 && from !== to && ` · 1 ${to} = ${fmtRate(1 / unit)} ${from}`}
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            Agrega al menos una divisa para empezar a convertir.
          </p>
        )}
      </div>
    </GlassCard>
  );
}
