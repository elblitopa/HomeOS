import { useCallback } from "react";
import MonthGrid from "../../components/ui/MonthGrid.jsx";
import { fmtMoney } from "../../lib/constants.js";

const hora = (iso) =>
  new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });

/** La vista Calendario de la Agenda.
 *
 *  El bloque de cada evento es una tarjetita con sus propiedades (como la
 *  vista de calendario de Notion): barra de título con hora y cliente —
 *  verde si dejó anticipo, azul si no — y abajo monto, municipio, renta y
 *  el reservado. El inicio es obligatorio, así que no hay franja sin fecha.
 */
export default function AgendaCalendar({ items, onOpen }) {
  const getDate = useCallback((e) => e.start, []);

  const renderChip = (e) => (
    <span className="block overflow-hidden rounded-lg border border-glass-border bg-surface/70">
      <span
        className={`block truncate px-1.5 py-0.5 text-[11px] font-semibold text-white ${
          e.reserved ? "bg-ok" : "bg-accent"
        }`}
      >
        {hora(e.start)} {e.client_name}
      </span>
      <span className="flex flex-col gap-0.5 p-1.5 text-[10px] leading-tight text-ink-soft">
        <span className="font-semibold text-ink">{fmtMoney(e.amount)} MXN</span>
        {e.municipality && <span className="truncate">{e.municipality}</span>}
        {e.place && <span className="truncate">📍 {e.place}</span>}
        {(e.rentals || []).length > 0 && (
          <span className="flex flex-wrap gap-0.5">
            {e.rentals.map((r) => (
              <span key={r} className="rounded bg-accent/15 px-1 py-px text-[9px] font-medium text-accent">
                {r}
              </span>
            ))}
          </span>
        )}
        {e.reserved ? (
          <span className="font-medium text-ok">✓ Reservado ({fmtMoney(e.deposit)})</span>
        ) : (
          <span>Sin anticipo</span>
        )}
      </span>
    </span>
  );

  return <MonthGrid items={items} getDate={getDate} renderChip={renderChip} onOpen={onOpen} />;
}
