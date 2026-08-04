import { useCallback } from "react";
import MonthGrid from "../../components/ui/MonthGrid.jsx";

const hora = (iso) =>
  new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });

/** La vista Calendario de la Agenda: chip verde si el evento está reservado
 *  (dejó anticipo), azul si no. El inicio es obligatorio, así que no hay
 *  franja de "sin fecha". */
export default function AgendaCalendar({ items, onOpen }) {
  const getDate = useCallback((e) => e.start, []);

  const renderChip = (e) => (
    <span
      className={`block truncate rounded px-1 py-0.5 text-[10px] font-medium text-white ${
        e.reserved ? "bg-ok" : "bg-accent"
      }`}
      title={`${e.client_name}${e.reserved ? " · reservado" : " · sin anticipo"}`}
    >
      {hora(e.start)} {e.client_name}
    </span>
  );

  return <MonthGrid items={items} getDate={getDate} renderChip={renderChip} onOpen={onOpen} />;
}
