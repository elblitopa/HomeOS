import { useEffect, useState } from "react";
import { apiDelete, apiPost, apiPut } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { PRIORITIES, REMINDER_OPTIONS, toInputValue } from "../../lib/constants.js";

const EMPTY = {
  title: "",
  description: "",
  context_id: "",
  priority: 2,
  due_date: "",
  reminders: [],
};

export const inputCls =
  "w-full rounded-xl border border-glass-border bg-surface/70 px-3 py-2 text-sm outline-none transition focus:border-accent";

export function ReminderPicker({ value, onChange, disabled }) {
  const toggle = (v) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className={`flex flex-wrap gap-1.5 ${disabled ? "opacity-40" : ""}`}>
      {REMINDER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => toggle(opt.value)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
            value.includes(opt.value)
              ? "bg-accent text-white"
              : "bg-ink/5 text-ink-soft hover:bg-accent-soft"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function TaskFormModal({ open, todo, contexts, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(
        todo
          ? {
              title: todo.title,
              description: todo.description || "",
              context_id: todo.context_id ?? "",
              priority: todo.priority,
              due_date: toInputValue(todo.due_date),
              reminders: todo.reminders || [],
            }
          : EMPTY
      );
      setError(null);
    }
  }, [open, todo]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (!form.title.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        context_id: form.context_id ? Number(form.context_id) : null,
        priority: Number(form.priority),
        due_date: form.due_date || null,
        reminders: form.due_date ? form.reminders : [],
      };
      if (todo) await apiPut(`/api/todos/${todo.id}`, payload);
      else await apiPost("/api/todos", payload);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar la tarea "${todo.title}" y su historial?`)) return;
    try {
      await apiDelete(`/api/todos/${todo.id}`);
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={todo ? "Editar tarea" : "Nueva tarea"}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Título
          <input
            className={inputCls}
            value={form.title}
            onChange={set("title")}
            placeholder="¿Qué hay que hacer?"
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Descripción
          <textarea
            className={`${inputCls} min-h-20 resize-y`}
            value={form.description}
            onChange={set("description")}
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Contexto
            <select className={inputCls} value={form.context_id} onChange={set("context_id")}>
              <option value="">Sin contexto</option>
              {contexts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Prioridad
            <select className={inputCls} value={form.priority} onChange={set("priority")}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Fecha límite (opcional)
          <input
            type="datetime-local"
            className={inputCls}
            value={form.due_date}
            onChange={set("due_date")}
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Avisos por Discord
          {!form.due_date && (
            <p className="text-xs font-normal text-ink-soft">
              Ponle fecha límite para activar los avisos.
            </p>
          )}
          <ReminderPicker
            value={form.reminders}
            onChange={(r) => setForm((f) => ({ ...f, reminders: r }))}
            disabled={!form.due_date}
          />
        </div>

        {error && <p className="text-sm text-err">{error}</p>}

        <div className="flex justify-between gap-2">
          {todo ? (
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
            <Button onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
