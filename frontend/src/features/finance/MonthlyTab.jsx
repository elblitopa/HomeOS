import { useEffect, useState } from "react";
import { apiGet } from "../../api/client.js";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { fmtMoney, monthLabel } from "../../lib/constants.js";

export default function MonthlyTab({ version }) {
  const [summary, setSummary] = useState({ by_month: {} });

  useEffect(() => {
    apiGet("/api/finance/summary").then(setSummary).catch(() => {});
  }, [version]);

  const months = Object.entries(summary.by_month || {});

  if (months.length === 0) {
    return (
      <GlassCard className="p-10 text-center text-sm text-ink-soft">
        Aún no hay transacciones registradas.
      </GlassCard>
    );
  }

  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
      {months.map(([key, t]) => (
        <GlassCard key={key} className="p-4">
          <h3 className="mb-2 font-semibold">{monthLabel(key)}</h3>
          <div className="flex flex-col gap-0.5 text-sm">
            <p className="flex justify-between">
              <span className="text-ink-soft">Ingresos:</span>
              <span className="font-medium text-ok">{fmtMoney(t.ingresos)}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-ink-soft">Egresos:</span>
              <span className="font-medium text-err">{fmtMoney(t.egresos)}</span>
            </p>
            <p className="flex justify-between border-t border-ink/5 pt-1">
              <span className="text-ink-soft">Balance:</span>
              <span className={`font-semibold ${t.balance < 0 ? "text-err" : ""}`}>
                {fmtMoney(t.balance)}
              </span>
            </p>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
