import { useCallback } from "react";
import MonthGrid from "../../components/ui/MonthGrid.jsx";
import { PRIORIDAD } from "./ProjectsSection.jsx";

/** La vista Calendario de la matriz de proyectos: la grilla vive en
 *  MonthGrid (compartida con la Agenda); aquí solo va lo de proyectos —
 *  el chip coloreado por prioridad y la franja de los sin fecha. */
export default function ProjectsCalendar({ items, onOpen }) {
  const getDate = useCallback((p) => p.due_date, []);

  const renderChip = (p) => {
    const pr = PRIORIDAD[p.priority] || PRIORIDAD.P2;
    return (
      <span
        className={`block truncate rounded px-1 py-0.5 text-[10px] font-medium text-white ${
          p.progress === "terminado" ? "opacity-50 line-through" : ""
        }`}
        style={{ backgroundColor: pr.dot }}
        title={`${p.title} (${p.priority})`}
      >
        {p.title}
      </span>
    );
  };

  return (
    <MonthGrid
      items={items}
      getDate={getDate}
      renderChip={renderChip}
      onOpen={onOpen}
      sinFecha={{
        label: "Sin fecha límite",
        render: (p) => {
          const pr = PRIORIDAD[p.priority] || PRIORIDAD.P2;
          return (
            <span className={`rounded-lg px-2 py-1 text-xs font-medium transition hover:opacity-80 ${pr.chip}`}>
              {p.title}
            </span>
          );
        },
      }}
    />
  );
}
