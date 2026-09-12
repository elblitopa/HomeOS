import { usePrivacidad } from "./privacidad.jsx";

/** Utilización de una tarjeta de crédito, en dos densidades.
 *
 *  Toda la aritmética (used/available/over_limit/%/estado) viene del backend
 *  en `card` — aquí NADIE recalcula umbrales ni signos. El porcentaje queda
 *  visible aunque la privacidad esté activa: por sí solo no revela montos.
 *  Los estados llevan color Y texto (nunca solo color).
 */

// tono por estado del backend (UTILIZACION_NIVELES en services/tarjetas.py)
const NIVEL = {
  normal: { color: "#2f9e44", texto: null },
  info: { color: "#2383e2", texto: null },
  advertencia: { color: "#f59e0b", texto: null },
  alta: { color: "#e8590c", texto: "Alta utilización" },
  excedido: { color: "#e03131", texto: "Límite alcanzado" },
};

function Barra({ pct, color }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10" role="presentation">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function CreditoUtilizacion({ card, compact = false, currency }) {
  const { money } = usePrivacidad();
  if (!card) return null;

  const nivel = NIVEL[card.utilization_state] || NIVEL.normal;
  const textoEstado =
    card.utilization_state === "excedido" && card.over_limit > 0
      ? `Límite excedido por ${money(card.over_limit, currency)}`
      : nivel.texto;

  // sin límite configurado: sin %, sin disponible, sin división entre cero
  if (!card.credit_limit) {
    return (
      <p className={`text-xs text-ink-soft ${compact ? "mt-1.5" : ""}`}>
        Límite no configurado
      </p>
    );
  }

  if (compact) {
    return (
      <div className="mt-1.5 flex flex-col gap-1">
        <p className="text-xs text-ink-soft">
          Disponible <span className="font-medium text-ink">{money(card.available, currency)}</span>{" "}
          de {money(card.credit_limit, currency)}
        </p>
        <div className="flex items-center gap-2">
          <Barra pct={card.utilization_percent} color={nivel.color} />
          <span className="shrink-0 text-[11px] font-semibold" style={{ color: nivel.color }}>
            {card.utilization_percent}%
          </span>
        </div>
        {textoEstado && (
          <p className="text-[11px] font-medium" style={{ color: nivel.color }}>
            {textoEstado}
          </p>
        )}
        {card.credit_balance > 0 && (
          <p className="text-[11px] text-ok">Saldo a favor: {money(card.credit_balance, currency)}</p>
        )}
      </div>
    );
  }

  const filas = [
    ["Límite total", money(card.credit_limit, currency)],
    ["Utilizado", money(card.used, currency)],
    ["Disponible", money(card.available, currency)],
    card.over_limit > 0 && ["Excedido", money(card.over_limit, currency)],
    card.credit_balance > 0 && ["Saldo a favor", money(card.credit_balance, currency)],
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-1.5">
      {filas.map(([label, valor]) => (
        <div key={label} className="flex items-baseline justify-between text-sm">
          <span className="text-ink-soft">{label}</span>
          <span className={`font-medium ${label === "Excedido" ? "text-err" : ""}`}>{valor}</span>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2">
        <Barra pct={card.utilization_percent} color={nivel.color} />
        <span className="shrink-0 text-xs font-semibold" style={{ color: nivel.color }}>
          {card.utilization_percent}%
        </span>
      </div>
      {textoEstado && (
        <p className="text-xs font-medium" style={{ color: nivel.color }}>
          {textoEstado}
        </p>
      )}
    </div>
  );
}
