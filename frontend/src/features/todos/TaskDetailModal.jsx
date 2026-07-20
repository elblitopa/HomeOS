import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiUpload } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { formatDateTime, priorityOf } from "../../lib/constants.js";
import { inputCls } from "./TaskFormModal.jsx";

export default function TaskDetailModal({ todoId, contexts, onClose, onChanged }) {
  const [todo, setTodo] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    if (!todoId) return;
    apiGet(`/api/todos/${todoId}`).then(setTodo).catch((e) => setError(e.message));
  }, [todoId]);

  useEffect(() => {
    setTodo(null);
    setNote("");
    setError(null);
    load();
  }, [load]);

  if (!todoId) return null;

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/api/todos/${todoId}/entries`, { kind: "nota", text: note.trim() });
      setNote("");
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const up = await apiUpload("/api/uploads/file", file);
      await apiPost(`/api/todos/${todoId}/entries`, {
        kind: "archivo",
        file_path: up.path,
        file_name: up.file_name,
      });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const toggle = async () => {
    await apiPost(`/api/todos/${todoId}/toggle`);
    load();
    onChanged();
  };

  const prio = todo ? priorityOf(todo.priority) : null;
  const ctx = todo?.context_id ? contexts[todo.context_id] : null;
  const done = todo?.status === "completada";

  // timeline: creación + entradas + completada
  const timeline = todo
    ? [
        { id: "created", icon: "🟢", text: "Tarea creada", at: todo.created_at },
        ...todo.entries.map((e) => ({
          id: e.id,
          icon: e.kind === "archivo" ? "📎" : "💬",
          text: e.kind === "archivo" ? null : e.text,
          file: e.kind === "archivo" ? e : null,
          at: e.created_at,
        })),
        ...(todo.completed_at
          ? [{ id: "done", icon: "🏁", text: "Completada", at: todo.completed_at }]
          : []),
      ]
    : [];

  return (
    <Modal open={!!todoId} onClose={onClose} title={todo?.title || "…"}>
      {!todo ? (
        <p className="text-sm text-ink-soft">{error || "Cargando…"}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 font-medium"
              style={{ color: prio.color }}
            >
              ● {prio.label}
            </span>
            {ctx && (
              <span
                className="rounded-full px-2.5 py-1 font-medium text-white"
                style={{ backgroundColor: ctx.color }}
              >
                {ctx.name}
              </span>
            )}
            {todo.due_date && (
              <span className="rounded-full bg-ink/5 px-2.5 py-1 text-ink-soft">
                ⏰ límite: {formatDateTime(todo.due_date)}
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-1 font-medium ${
                done ? "bg-ok/10 text-ok" : "bg-accent-soft text-accent"
              }`}
            >
              {done ? "Completada" : "Pendiente"}
            </span>
          </div>

          {todo.description && (
            <p className="whitespace-pre-wrap text-sm text-ink-soft">{todo.description}</p>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold">Línea de tiempo</h3>
            <div className="flex flex-col gap-0">
              {timeline.map((item, i) => (
                <div key={item.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="text-sm leading-6">{item.icon}</span>
                    {i < timeline.length - 1 && (
                      <span className="w-px flex-1 bg-ink/10" />
                    )}
                  </div>
                  <div className="pb-4">
                    {item.file ? (
                      <a
                        href={item.file.file_path}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-accent hover:underline"
                      >
                        {item.file.file_name || "archivo"}
                      </a>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm">{item.text}</p>
                    )}
                    <p className="text-xs text-ink-soft">{formatDateTime(item.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              className={inputCls}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Agregar nota al historial…"
              onKeyDown={(e) => e.key === "Enter" && addNote()}
            />
            <Button onClick={addNote} disabled={busy || !note.trim()}>
              Anotar
            </Button>
            <label className="inline-flex cursor-pointer items-center rounded-xl border border-glass-border px-3 text-sm hover:bg-ink/5">
              📎
              <input type="file" className="hidden" onChange={addFile} disabled={busy} />
            </label>
          </div>

          {error && <p className="text-sm text-err">{error}</p>}

          <div className="flex justify-end">
            <Button variant={done ? "ghost" : "primary"} onClick={toggle}>
              {done ? "Reabrir tarea" : "✓ Marcar completada"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
