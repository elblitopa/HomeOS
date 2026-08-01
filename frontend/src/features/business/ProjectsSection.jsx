import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { toInputLocal } from "../../lib/constants.js";
import { inputCls } from "../todos/TaskFormModal.jsx";
import ProjectsBoard from "./ProjectsBoard.jsx";
import ProjectsCalendar from "./ProjectsCalendar.jsx";
import ProjectsTable from "./ProjectsTable.jsx";

// prioridad y progreso comparten estos catalogos en las tres vistas, para
// que un color signifique lo mismo en la tabla, el tablero y el calendario
export const PRIORIDADES = [
  { key: "P1", label: "P1", chip: "bg-err/15 text-err", dot: "#e03131" },
  { key: "P2", label: "P2", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-500", dot: "#f59e0b" },
  { key: "P3", label: "P3", chip: "bg-ink/10 text-ink-soft", dot: "#868e96" },
];
export const PRIORIDAD = Object.fromEntries(PRIORIDADES.map((p) => [p.key, p]));

export const PROGRESOS = [
  { key: "sin_empezar", label: "Sin empezar", icon: "🏁", chip: "bg-ink/10 text-ink-soft" },
  { key: "en_curso", label: "En curso", icon: "🏃", chip: "bg-accent/15 text-accent" },
  { key: "terminado", label: "Terminado", icon: "✅", chip: "bg-ok/15 text-ok" },
];
export const PROGRESO = Object.fromEntries(PROGRESOS.map((p) => [p.key, p]));

const VISTAS = [
  { key: "tabla", label: "Tabla" },
  { key: "tablero", label: "Tablero" },
  { key: "calendario", label: "Calendario" },
];

function ProjectFormModal({ open, item, contextId, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setForm({
        title: item?.title || "",
        priority: item?.priority || "P2",
        progress: item?.progress || "sin_empezar",
        area: item?.area || "",
        due: item?.due_date ? toInputLocal(new Date(item.due_date)) : "",
        strategy: item?.strategy || "",
        clients: item?.clients || "",
      });
      setError(null);
    }
  }, [open, item]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (!form.title.trim()) return;
    const payload = {
      context_id: contextId,
      title: form.title.trim(),
      priority: form.priority,
      progress: form.progress,
      area: form.area.trim() || null,
      due_date: form.due || null,
      strategy: form.strategy.trim() || null,
      clients: form.clients.trim() || null,
      sort_order: item?.sort_order ?? 0,
    };
    try {
      if (item) await apiPut(`/api/business/projects/${item.id}`, payload);
      else await apiPost("/api/business/projects", payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar el proyecto "${item.title}"?`)) return;
    await apiDelete(`/api/business/projects/${item.id}`);
    onSaved();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={item ? "Editar proyecto" : "Nuevo proyecto"}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tarea / proyecto
          <input
            className={inputCls}
            value={form.title || ""}
            onChange={set("title")}
            placeholder="Agregar productos a TikTok Shop…"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            Prioridad
            <div className="flex gap-1">
              {PRIORIDADES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setForm((f) => ({ ...f, priority: p.key }))}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${p.chip} ${
                    form.priority === p.key ? "ring-2 ring-accent" : "opacity-60 hover:opacity-100"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Progreso
            <select className={inputCls} value={form.progress || "sin_empezar"} onChange={set("progress")}>
              {PROGRESOS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.icon} {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Área
            <input className={inputCls} value={form.area || ""} onChange={set("area")} placeholder="Marketing, Desarrollo…" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Fecha límite
            <input type="datetime-local" className={inputCls} value={form.due || ""} onChange={set("due")} />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Estrategia
          <textarea
            className={`${inputCls} min-h-16 resize-y`}
            value={form.strategy || ""}
            onChange={set("strategy")}
            placeholder="Cómo se va a atacar, notas del plan…"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Clientes
          <textarea className={`${inputCls} min-h-12 resize-y`} value={form.clients || ""} onChange={set("clients")} />
        </label>

        {error && <p className="text-sm text-err">{error}</p>}
        <div className="flex justify-between gap-2">
          {item ? (
            <Button variant="danger" onClick={remove}>
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={!form.title?.trim()}>
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** La matriz de proyectos del negocio: Tabla, Tablero y Calendario sobre los
 *  mismos datos. Las vistas solo pintan; crear, editar y mover viven aquí. */
export default function ProjectsSection({ contextId }) {
  const [items, setItems] = useState([]);
  const [vista, setVista] = useState("tabla");
  const [modal, setModal] = useState(null); // null | {} | {item}

  const refresh = useCallback(() => {
    apiGet(`/api/business/projects?context_id=${contextId}`).then(setItems).catch(() => {});
  }, [contextId]);

  useEffect(refresh, [refresh]);

  const onMove = async (id, progress) => {
    // optimista, igual que el kanban de Contenido
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, progress } : p)));
    try {
      await apiPost(`/api/business/projects/${id}/progress`, { progress });
    } finally {
      refresh();
    }
  };

  const onOpen = (item) => setModal({ item });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <Button onClick={() => setModal({})}>＋ Proyecto</Button>
      </div>

      {vista === "tabla" && <ProjectsTable items={items} onOpen={onOpen} onMove={onMove} />}
      {vista === "tablero" && <ProjectsBoard items={items} onOpen={onOpen} onMove={onMove} />}
      {vista === "calendario" && <ProjectsCalendar items={items} onOpen={onOpen} />}

      <ProjectFormModal
        open={!!modal}
        item={modal?.item}
        contextId={contextId}
        onClose={() => setModal(null)}
        onSaved={refresh}
      />
    </div>
  );
}
