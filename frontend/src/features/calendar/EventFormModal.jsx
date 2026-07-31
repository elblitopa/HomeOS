import { useEffect, useState } from "react";
import { apiDelete, apiPost, apiPut } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { toInputValue } from "../../lib/constants.js";
import { inputCls, ReminderPicker } from "../todos/TaskFormModal.jsx";

const EMPTY = {
  title: "",
  description: "",
  context_id: "",
  start: "",
  end: "",
  all_day: false,
  reminders: [30],
  sync_google: true,
};

export default function EventFormModal({
  open,
  event,
  prefillDate,
  contexts,
  googleReady = false,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // los eventos de Google se editan contra Google, no contra la base local
  const esGoogle = form.source === "google";

  useEffect(() => {
    if (open) {
      if (event) {
        setForm({
          title: event.title,
          description: event.description || "",
          context_id: event.context_id ?? "",
          start: toInputValue(event.start),
          end: toInputValue(event.end),
          all_day: event.all_day,
          reminders: event.reminders || [],
          sync_google: event.sync_google ?? true,
          source: event.source || "homeos",
          calendar_id: event.calendar_id || null,
          calendar_name: event.calendar_name || null,
        });
      } else {
        setForm({
          ...EMPTY,
          source: "homeos",
          // desde la vista diaria llega con hora; desde el mes solo la fecha
          start: prefillDate ? (prefillDate.includes("T") ? prefillDate : `${prefillDate}T09:00`) : "",
        });
      }
      setError(null);
    }
  }, [open, event, prefillDate]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (!form.title.trim() || !form.start) {
      setError("Título y fecha de inicio son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const base = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        start: form.all_day ? `${form.start.slice(0, 10)}T00:00` : form.start,
        end: form.end || null,
        all_day: form.all_day,
      };
      if (esGoogle) {
        // se edita en el calendario donde vive, no en el de escritura
        const conCal = { ...base, calendar_id: form.calendar_id || null };
        if (event) await apiPut(`/api/google/events/${encodeURIComponent(event.id)}`, conCal);
        else await apiPost("/api/google/events", conCal);
      } else {
        const payload = {
          ...base,
          context_id: form.context_id ? Number(form.context_id) : null,
          reminders: form.reminders,
          sync_google: form.sync_google,
        };
        if (event) await apiPut(`/api/events/${event.id}`, payload);
        else await apiPost("/api/events", payload);
      }
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const donde = esGoogle ? " de Google Calendar" : "";
    if (!confirm(`¿Eliminar el evento "${event.title}"${donde}?`)) return;
    try {
      const url = esGoogle
        ? `/api/google/events/${encodeURIComponent(event.id)}` +
          (form.calendar_id ? `?calendar_id=${encodeURIComponent(form.calendar_id)}` : "")
        : `/api/events/${event.id}`;
      await apiDelete(url);
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={event ? "Editar evento" : "Nuevo evento"}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Título
          <input
            className={inputCls}
            value={form.title}
            onChange={set("title")}
            placeholder="Reunión, entrega, pago…"
            autoFocus
          />
        </label>

        {/* al crear se elige donde guardarlo; al editar solo se informa */}
        {googleReady && (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Guardar en
            {event ? (
              <p className="text-sm font-normal text-ink-soft">
                {esGoogle
                  ? `📆 Google · ${form.calendar_name || "Calendar"}`
                  : "🏠 HomeOS"}
              </p>
            ) : (
              <select
                className={inputCls}
                value={form.source}
                onChange={set("source")}
              >
                <option value="homeos">🏠 HomeOS</option>
                <option value="google">📆 Google Calendar</option>
              </select>
            )}
          </label>
        )}

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.all_day}
            onChange={(e) => setForm((f) => ({ ...f, all_day: e.target.checked }))}
            className="h-4 w-4 accent-[#2383e2]"
          />
          Todo el día
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Inicio
            <input
              type={form.all_day ? "date" : "datetime-local"}
              className={inputCls}
              value={form.all_day ? form.start.slice(0, 10) : form.start}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  start: form.all_day ? `${e.target.value}T00:00` : e.target.value,
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Fin (opcional)
            <input
              type="datetime-local"
              className={inputCls}
              value={form.end}
              onChange={set("end")}
              disabled={form.all_day}
            />
          </label>
        </div>

        {/* contexto y avisos son de HomeOS; Google no los guarda */}
        {!esGoogle && (
          <>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Contexto
              <select className={inputCls} value={form.context_id} onChange={set("context_id")}>
                <option value="">General</option>
                {contexts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-1.5 text-sm font-medium">
              Avisos por Discord
              <ReminderPicker
                value={form.reminders}
                onChange={(r) => setForm((f) => ({ ...f, reminders: r }))}
              />
            </div>

            {/* el evento se queda en HomeOS y ademas se copia a Google, para
                que el celular avise por su cuenta con los mismos avisos */}
            {googleReady && (
              <label className="flex items-start gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.sync_google}
                  onChange={(e) => setForm((f) => ({ ...f, sync_google: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-[#2383e2]"
                />
                <span>
                  También en Google Calendar
                  <span className="block text-xs font-normal text-ink-soft">
                    Copia el evento a Google para que te llegue la notificación al celular.
                  </span>
                </span>
              </label>
            )}
          </>
        )}

        <label className="flex flex-col gap-1 text-sm font-medium">
          Descripción
          <textarea
            className={`${inputCls} min-h-16 resize-y`}
            value={form.description}
            onChange={set("description")}
          />
        </label>

        {error && <p className="text-sm text-err">{error}</p>}

        <div className="flex justify-between gap-2">
          {event ? (
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
