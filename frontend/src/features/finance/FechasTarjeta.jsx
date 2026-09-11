/** Las dos líneas de una tarjeta de crédito: próximo corte y próximo pago.
 *
 *  `card` viene calculado del backend (fechas_tarjeta): fechas ya resueltas
 *  con el mes correcto (corte 15 → pago 5 del mes siguiente) y días
 *  restantes. Aquí solo se pinta; sin `card` no se ocupa espacio.
 */

function fechaCorta(iso) {
  // date-only anclado a mediodía local para que no retroceda un día
  return new Date(`${iso}T12:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

function tono(dias) {
  if (dias === 0) return "font-medium text-err";
  if (dias <= 3) return "font-medium text-amber-600 dark:text-amber-500";
  return "text-ink-soft";
}

function restante(dias) {
  if (dias === 0) return "es hoy";
  if (dias === 1) return "es mañana";
  return `faltan ${dias} días`;
}

export default function FechasTarjeta({ card, className = "" }) {
  if (!card || (!card.statement_date && !card.payment_date)) return null;
  const filas = [
    card.statement_date && {
      icono: "💳",
      label: "Corte",
      fecha: card.statement_date,
      dias: card.statement_days_left,
    },
    card.payment_date && {
      icono: "💰",
      label: "Pago",
      fecha: card.payment_date,
      dias: card.payment_days_left,
    },
  ].filter(Boolean);

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {filas.map((f) => (
        <p key={f.label} className="text-xs text-ink-soft">
          {f.icono} {f.label}: {fechaCorta(f.fecha)} ·{" "}
          <span className={tono(f.dias)}>{restante(f.dias)}</span>
        </p>
      ))}
    </div>
  );
}
