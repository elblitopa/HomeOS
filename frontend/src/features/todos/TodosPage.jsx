import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import useContexts from "../../hooks/useContexts.js";
import { dueText, priorityOf, PRIORITIES } from "../../lib/constants.js";
import TaskDetailModal from "./TaskDetailModal.jsx";
import TaskFormModal from "./TaskFormModal.jsx";

const STATUS_TABS = [
  { value: "pendiente", label: "Pendientes" },
  { value: "completada", label: "Completadas" },
  { value: "", label: "Todas" },
];

export default function TodosPage() {
  const { contexts, byId } = useContexts();
  const [todos, setTodos] = useState([]);
  const [statusFilter, setStatusFilter] = useState("pendiente");
  const [contextFilter, setContextFilter] = useState(null);
  const [priorityFilter, setPriorityFilter] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const refresh = useCallback(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (contextFilter) params.set("context_id", contextFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    apiGet(`/api/todos?${params}`).then(setTodos).catch(() => {});
  }, [statusFilter, contextFilter, priorityFilter]);

  useEffect(refresh, [refresh]);

  const toggle = async (todo) => {
    await apiPost(`/api/todos/${todo.id}/toggle`);
    refresh();
  };

  const chip = (active) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      active ? "bg-accent text-white" : "bg-ink/5 text-ink-soft hover:bg-accent-soft"
    }`;

  return (
    <div className="p-6 md:p-8">
      <TopBar
        title="Tareas"
        subtitle={`${todos.filter((t) => t.status === "pendiente").length} pendientes`}
      >
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          ＋ Nueva tarea
        </Button>
      </TopBar>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            className={chip(statusFilter === tab.value)}
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-ink/10" />
        <button className={chip(!contextFilter)} onClick={() => setContextFilter(null)}>
          Todos los contextos
        </button>
        {contexts.map((c) => (
          <button
            key={c.id}
            className={chip(contextFilter === c.id)}
            style={contextFilter === c.id ? { backgroundColor: c.color } : {}}
            onClick={() => setContextFilter(contextFilter === c.id ? null : c.id)}
          >
            {c.name}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-ink/10" />
        {PRIORITIES.map((p) => (
          <button
            key={p.value}
            className={chip(priorityFilter === p.value)}
            style={priorityFilter === p.value ? { backgroundColor: p.color } : {}}
            onClick={() => setPriorityFilter(priorityFilter === p.value ? null : p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {todos.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-2 p-12 text-center">
          <span className="text-4xl">✅</span>
          <p className="font-medium">Nada por aquí</p>
          <p className="text-sm text-ink-soft">
            {statusFilter === "pendiente"
              ? "No tienes tareas pendientes con estos filtros."
              : "No hay tareas con estos filtros."}
          </p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2">
          {todos.map((todo) => {
            const prio = priorityOf(todo.priority);
            const ctx = todo.context_id ? byId[todo.context_id] : null;
            const due = dueText(todo.due_date);
            const done = todo.status === "completada";
            return (
              <GlassCard
                key={todo.id}
                className="flex cursor-pointer items-center gap-3 p-3.5 transition hover:bg-white/75"
              >
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => toggle(todo)}
                  className="h-5 w-5 shrink-0 accent-[#2383e2]"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="min-w-0 flex-1" onClick={() => setDetailId(todo.id)}>
                  <p
                    className={`truncate font-medium ${
                      done ? "text-ink-soft line-through" : ""
                    }`}
                  >
                    {todo.title}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                    <span
                      className="inline-flex items-center gap-1"
                      title={`Prioridad ${prio.label}`}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: prio.color }}
                      />
                      {prio.label}
                    </span>
                    {ctx && (
                      <span
                        className="rounded-full px-2 py-0.5 text-white"
                        style={{ backgroundColor: ctx.color }}
                      >
                        {ctx.name}
                      </span>
                    )}
                    {due && !done && (
                      <span className={due.overdue ? "font-medium text-err" : ""}>
                        ⏰ {due.text}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(todo);
                    setFormOpen(true);
                  }}
                  title="Editar"
                >
                  ✏️
                </Button>
              </GlassCard>
            );
          })}
        </div>
      )}

      <TaskFormModal
        open={formOpen}
        todo={editing}
        contexts={contexts}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          refresh();
        }}
      />
      <TaskDetailModal
        todoId={detailId}
        contexts={byId}
        onClose={() => setDetailId(null)}
        onChanged={refresh}
      />
    </div>
  );
}
