import { useEffect, useState } from "react";
import { apiGet } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import { miniatura } from "../../components/ui/Comprobante.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { fmtMoney } from "../../lib/constants.js";
import { GoalModal } from "./FinanceModals.jsx";

/** Todas las metas como página: primero las que faltan por alcanzar y luego
 *  las completadas — celebradas con su palomita, nunca como "vencidas".
 *  Cada tarjeta lleva su banner, igual que en el carrusel del Resumen. */

function Progreso({ value, color = "#2383e2" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, value * 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function TarjetaMeta({ g, onClick }) {
  return (
    <GlassCard
      banner={miniatura(g.banner_path, 640)}
      className="cursor-pointer transition hover:bg-surface/75"
      onClick={onClick}
    >
      {!g.banner_path && (
        <div className="h-24 w-full bg-gradient-to-br from-accent/25 to-accent/5" />
      )}
      <div className="p-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <p className="truncate font-medium">{g.name}</p>
          {g.completed ? (
            <span className="shrink-0 rounded-full bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok">
              ✓ Completada
            </span>
          ) : g.deadline ? (
            <span
              className={`shrink-0 text-xs ${
                g.days_left < 0 ? "font-medium text-err" : "text-ink-soft"
              }`}
            >
              {g.days_left < 0
                ? `venció hace ${Math.abs(g.days_left)} d`
                : g.days_left === 0
                  ? "vence hoy"
                  : `faltan ${g.days_left} d`}
            </span>
          ) : null}
        </div>
        <Progreso value={g.progress} color={g.completed ? "#2f9e44" : "#2383e2"} />
        <p className="mt-1.5 text-sm text-ink-soft">
          {fmtMoney(g.saved_amount)} de {fmtMoney(g.target_amount)}{" "}
          <span className="font-medium text-ink">({Math.round(g.progress * 100)}%)</span>
        </p>
        {!g.completed && g.target_amount > g.saved_amount && (
          <p className="text-xs text-ink-soft">
            Falta {fmtMoney(g.target_amount - g.saved_amount)}
          </p>
        )}
      </div>
    </GlassCard>
  );
}

export default function MetasTab({ reload, version }) {
  const [goals, setGoals] = useState([]);
  const [modal, setModal] = useState(null); // null | {data?}

  useEffect(() => {
    apiGet("/api/finance/goals").then(setGoals).catch(() => {});
  }, [version]);

  const pendientes = goals.filter((g) => !g.completed);
  const completadas = goals.filter((g) => g.completed);

  const saved = () => {
    setModal(null);
    reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink-soft">🎯 Metas</h2>
          {goals.length > 0 && (
            <p className="text-xs text-ink-soft">
              {pendientes.length} por alcanzar · {completadas.length} completada
              {completadas.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <Button onClick={() => setModal({})}>＋ Meta</Button>
      </div>

      {goals.length === 0 ? (
        <GlassCard className="p-10 text-center text-sm text-ink-soft">
          Sin metas todavía. Crea la primera con ＋ y ahórrale con transferencias
          desde tus cuentas.
        </GlassCard>
      ) : (
        <>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Por alcanzar ({pendientes.length})
            </p>
            {pendientes.length === 0 ? (
              <GlassCard className="p-6 text-center text-sm text-ink-soft">
                Nada pendiente — todas tus metas están completadas 🎉
              </GlassCard>
            ) : (
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
                {pendientes.map((g) => (
                  <TarjetaMeta key={g.id} g={g} onClick={() => setModal({ data: g })} />
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Completadas ({completadas.length})
            </p>
            {completadas.length === 0 ? (
              <p className="text-sm text-ink-soft">Todavía ninguna — ya caerá la primera.</p>
            ) : (
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
                {completadas.map((g) => (
                  <TarjetaMeta key={g.id} g={g} onClick={() => setModal({ data: g })} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <GoalModal
        open={Boolean(modal)}
        goal={modal?.data}
        onClose={() => setModal(null)}
        onSaved={saved}
      />
    </div>
  );
}
