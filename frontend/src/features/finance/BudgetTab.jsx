import { useEffect, useState } from "react";
import { apiGet } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { BASE_CURRENCY, fmtMoney, PERIODS } from "../../lib/constants.js";

const KIND_ICON = {
  Suscripción: "🔁",
  "Pago recurrente": "📆",
  Meta: "🎯",
};

const periodLabel = (v) => PERIODS.find((p) => p.value === v)?.label || v;

function Stat({ label, value, tone = "", hint }) {
  return (
    <GlassCard className="p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{fmtMoney(value)}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-soft">{hint}</p>}
    </GlassCard>
  );
}

export default function BudgetTab({ version }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGet("/api/finance/budget").then(setData).catch((e) => setError(e.message));
  }, [version]);

  if (error) return <GlassCard className="p-6 text-sm text-err">{error}</GlassCard>;
  if (!data) return <p className="text-sm text-ink-soft">Calculando…</p>;

  const t = data.totals;
  const grupos = ["Suscripción", "Pago recurrente", "Meta"];
  const alcanza = t.balance_expected >= 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          Lo que necesitas cada mes para cubrir tus compromisos · {data.month_label}
        </p>
        <a href="/api/finance/budget/export.xlsx" download>
          <Button variant="ghost">⬇ Exportar a Excel</Button>
        </a>
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <Stat
          label="Necesitas al mes"
          value={t.commitments}
          tone="text-err"
          hint="suscripciones + deudas + metas"
        />
        <Stat label="Ingreso esperado" value={t.expected_income} tone="text-ok" hint="lo que planeas recibir" />
        <Stat label="Ingreso real del mes" value={t.actual_income} hint="lo que ya entró" />
        <Stat
          label="Te sobra / falta"
          value={t.balance_expected}
          tone={alcanza ? "text-ok" : "text-err"}
          hint={alcanza ? "con tu ingreso esperado alcanza" : "tu ingreso esperado no alcanza"}
        />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">Compromisos del mes</h2>
        {data.commitments.length === 0 ? (
          <GlassCard className="p-8 text-center text-sm text-ink-soft">
            Aún no tienes suscripciones, deudas ni metas registradas.
          </GlassCard>
        ) : (
          <GlassCard className="divide-y divide-ink/5">
            {grupos.map((kind) => {
              const items = data.commitments.filter((c) => c.kind === kind);
              if (!items.length) return null;
              const subtotal = items.reduce((s, c) => s + c.monthly_mxn, 0);
              return (
                <div key={kind}>
                  <div className="flex items-center justify-between bg-ink/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    <span>
                      {KIND_ICON[kind]} {kind}
                    </span>
                    <span>{fmtMoney(subtotal)}</span>
                  </div>
                  {items.map((c, i) => (
                    <div key={`${kind}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="truncate text-xs text-ink-soft">
                          {fmtMoney(c.amount, c.currency)}
                          {c.period !== "—" && ` · ${periodLabel(c.period)}`}
                          {c.account && ` · ${c.account}`}
                          {c.note && ` · ${c.note}`}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm font-semibold ${
                          c.monthly_mxn === 0 ? "text-ink-soft" : ""
                        }`}
                        title="Equivalente mensual en MXN"
                      >
                        {fmtMoney(c.monthly_mxn)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="flex items-center justify-between px-4 py-3 font-semibold">
              <span>Total al mes</span>
              <span className="text-err">{fmtMoney(t.commitments)}</span>
            </div>
          </GlassCard>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-soft">Ingresos por cuenta</h2>
          <span className="text-[11px] text-ink-soft">
            El ingreso esperado se captura al editar cada cuenta
          </span>
        </div>
        <GlassCard className="divide-y divide-ink/5">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            <span>Cuenta</span>
            <span className="w-28 text-right">Esperado</span>
            <span className="w-28 text-right">Real del mes</span>
          </div>
          {data.income.map((i) => (
            <div key={i.account} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 text-sm">
              <span className="truncate">
                {i.account}
                {i.currency !== BASE_CURRENCY && (
                  <span className="ml-1 text-xs text-ink-soft">({i.currency})</span>
                )}
              </span>
              <span className="w-28 text-right text-ink-soft">{fmtMoney(i.expected_mxn)}</span>
              <span className={`w-28 text-right font-medium ${i.actual_mxn > 0 ? "text-ok" : "text-ink-soft"}`}>
                {fmtMoney(i.actual_mxn)}
              </span>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 text-sm font-semibold">
            <span>Total</span>
            <span className="w-28 text-right">{fmtMoney(t.expected_income)}</span>
            <span className="w-28 text-right text-ok">{fmtMoney(t.actual_income)}</span>
          </div>
        </GlassCard>
      </section>

      <p className="text-xs text-ink-soft">
        Todo se convierte a MXN al tipo de cambio actual. Los montos que no son mensuales se
        prorratean (una suscripción anual cuenta como su doceava parte), y de cada meta se
        reparte lo que falta entre los meses que quedan hasta su fecha límite.
      </p>
    </div>
  );
}
