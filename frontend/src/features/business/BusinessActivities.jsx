import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import MonthGrid from "../../components/ui/MonthGrid.jsx";
import { PRIORIDAD, PROGRESO, PROGRESOS, ProjectFormModal } from "./ProjectsSection.jsx";

/** Actividades pendientes de TODOS los negocios, en la portada de /negocios.
 *
 *  Es una vista agregada de business_projects — los mismos registros que la
 *  matriz de cada negocio, nunca copias: editar aquí usa el mismo modal y los
 *  mismos endpoints, así que Inicio, el detalle del negocio y esta lista se
 *  actualizan solos. Terminadas fuera por defecto; el filtro por negocio
 *  aplica a la lista Y al calendario.
 */

const fmtFecha = (iso) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

const VISTAS = [
  { key: "lista", label: "Lista" },
  { key: "calendario", label: "Calendario" },
];

export default function BusinessActivities({ negocios }) {
  const [items, setItems] = useState([]);
  const [vista, setVista] = useState("lista");
  const [filtro, setFiltro] = useState(""); // "" = todos los negocios
  const [modal, setModal] = useState(null); // null | {} | {item}

  const refresh = useCallback(() => {
    apiGet("/api/business/projects").then(setItems).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  const negocioDe = useMemo(
    () => Object.fromEntries(negocios.map((n) => [n.id, n])),
    [negocios]
  );

  const pendientes = useMemo(() => {
    let lista = items.filter((p) => p.progress !== "terminado" && negocioDe[p.context_id]);
    if (filtro) lista = lista.filter((p) => p.context_id === Number(filtro));
    // la fecha manda, la prioridad desempata; sin fecha al final
    const peso = { P1: 0, P2: 1, P3: 2 };
    return [...lista].sort((a, b) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      if (da !== db) return da - db;
      return (peso[a.priority] ?? 1) - (peso[b.priority] ?? 1);
    });
  }, [items, filtro, negocioDe]);

  const onMove = async (id, progress) => {
    // optimista, igual que la matriz del negocio
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, progress } : p)));
    try {
      await apiPost(`/api/business/projects/${id}/progress`, { progress });
    } finally {
      refresh();
    }
  };

  const chipNegocio = (p) => {
    const n = negocioDe[p.context_id];
    if (!n) return null;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: n.color }} />
        {n.name}
      </span>
    );
  };

  const selectProgreso = (p) => (
    <select
      value={p.progress}
      onChange={(e) => onMove(p.id, e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={`cursor-pointer rounded-lg border-0 px-2 py-1 text-xs font-medium outline-none ${
        (PROGRESO[p.progress] || PROGRESOS[0]).chip
      }`}
    >
      {PROGRESOS.map((s) => (
        <option key={s.key} value={s.key}>
          {s.icon} {s.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="mt-8 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-soft">📋 Actividades pendientes</h2>
        <Button onClick={() => setModal({})}>＋ Actividad</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-ink/5 p-1">
          {VISTAS.map((v) => (
            <button
              key={v.key}
              onClick={() => setVista(v.key)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                vista === v.key ? "bg-surface shadow-sm" : "text-ink-soft"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <select
          className="rounded-xl border border-glass-border bg-surface/70 px-2.5 py-1.5 text-sm outline-none"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <option value="">Todos los negocios</option>
          {negocios.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </div>

      {vista === "lista" &&
        (pendientes.length === 0 ? (
          <GlassCard className="p-8 text-center text-sm text-ink-soft">
            No tienes actividades pendientes de negocios.
          </GlassCard>
        ) : (
          <>
            {/* desktop: tabla compacta tipo la matriz del negocio */}
            <GlassCard className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs text-ink-soft">
                    <th className="px-3 py-2 font-medium">Prioridad</th>
                    <th className="px-3 py-2 font-medium">Negocio</th>
                    <th className="px-3 py-2 font-medium">Progreso</th>
                    <th className="px-3 py-2 font-medium">Actividad</th>
                    <th className="px-3 py-2 font-medium">Fecha límite</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {pendientes.map((p) => {
                    const pr = PRIORIDAD[p.priority] || PRIORIDAD.P2;
                    const vencido = p.days_left != null && p.days_left < 0;
                    return (
                      <tr
                        key={p.id}
                        className="cursor-pointer transition hover:bg-ink/5"
                        onClick={() => setModal({ item: p })}
                      >
                        <td className="px-3 py-2.5">
                          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${pr.chip}`}>
                            {pr.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">{chipNegocio(p)}</td>
                        <td className="px-3 py-2.5">{selectProgreso(p)}</td>
                        <td className="max-w-64 truncate px-3 py-2.5 font-medium">{p.title}</td>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 text-xs ${
                            vencido ? "font-semibold text-err" : "text-ink-soft"
                          }`}
                        >
                          {p.due_date ? `${fmtFecha(p.due_date)}${vencido ? " ⏰" : ""}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </GlassCard>

            {/* móvil: una card compacta por actividad, sin tabla horizontal */}
            <div className="flex flex-col gap-2.5 md:hidden">
              {pendientes.map((p) => {
                const pr = PRIORIDAD[p.priority] || PRIORIDAD.P2;
                const vencido = p.days_left != null && p.days_left < 0;
                return (
                  <GlassCard key={p.id} className="p-3" onClick={() => setModal({ item: p })}>
                    <p className="text-sm font-medium">{p.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {chipNegocio(p)}
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${pr.chip}`}>
                        {pr.label}
                      </span>
                      {selectProgreso(p)}
                    </div>
                    {p.due_date && (
                      <p
                        className={`mt-1.5 text-xs ${
                          vencido ? "font-semibold text-err" : "text-ink-soft"
                        }`}
                      >
                        📅 {fmtFecha(p.due_date)}
                        {vencido ? " ⏰" : ""}
                      </p>
                    )}
                  </GlassCard>
                );
              })}
            </div>
          </>
        ))}

      {vista === "calendario" && (
        <MonthGrid
          items={pendientes}
          getDate={(p) => p.due_date}
          onOpen={(p) => setModal({ item: p })}
          renderChip={(p) => {
            const n = negocioDe[p.context_id];
            return (
              <span
                className="block truncate rounded px-1 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: n?.color || "#6b6b70" }}
                title={`${n?.name || ""}: ${p.title} (${p.priority})`}
              >
                {p.title}
              </span>
            );
          }}
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
      )}

      <ProjectFormModal
        open={!!modal}
        item={modal?.item}
        contextId={modal?.item?.context_id}
        negocios={negocios}
        onClose={() => setModal(null)}
        onSaved={refresh}
      />
    </div>
  );
}
