import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { inputCls } from "../todos/TaskFormModal.jsx";

const STATUSES = [
  { key: "idea", label: "💡 Idea" },
  { key: "guion", label: "✍️ Guion" },
  { key: "grabando", label: "🎥 Grabando" },
  { key: "editando", label: "✂️ Editando" },
  { key: "listo", label: "✅ Listo" },
  { key: "publicado", label: "🚀 Publicado" },
];

const FORMATS = [
  { value: "entretenimiento", label: "Entretenimiento" },
  { value: "shorts", label: "Shorts" },
  { value: "largos", label: "Largos" },
  { value: "anuncios", label: "Anuncios" },
];

const PLATFORMS = [
  { value: "tiktok", label: "TikTok", icon: "🎵" },
  { value: "youtube", label: "YouTube", icon: "▶️" },
  { value: "instagram", label: "Instagram", icon: "📸" },
  { value: "facebook", label: "Facebook", icon: "📘" },
  { value: "shopify", label: "Shopify", icon: "🛍️" },
];

const platformIcon = (v) => PLATFORMS.find((p) => p.value === v)?.icon || "🌐";

export default function ContentSection({ contextId }) {
  const [ideas, setIdeas] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const refresh = useCallback(() => {
    apiGet(`/api/business/content?context_id=${contextId}`).then(setIdeas).catch(() => {});
  }, [contextId]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    if (modal) {
      const i = modal.item;
      setForm({
        title: i?.title || "",
        status: i?.status || modal.status || "idea",
        format: i?.format || "",
        publish_date: i?.publish_date ? i.publish_date.slice(0, 10) : "",
        inspiration_url: i?.inspiration_url || "",
        drive_url: i?.drive_url || "",
        platforms: i?.platforms || [],
        notes: i?.notes || "",
      });
      setError(null);
    }
  }, [modal]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const togglePlatform = (v) =>
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(v)
        ? f.platforms.filter((x) => x !== v)
        : [...f.platforms, v],
    }));

  const save = async () => {
    if (!form.title.trim()) return setError("Ponle título a la idea.");
    setError(null);
    const payload = {
      context_id: contextId,
      title: form.title.trim(),
      status: form.status,
      format: form.format || null,
      publish_date: form.publish_date ? `${form.publish_date}T12:00` : null,
      inspiration_url: form.inspiration_url.trim() || null,
      drive_url: form.drive_url.trim() || null,
      platforms: form.platforms,
      notes: form.notes.trim() || null,
      sort_order: modal.item?.sort_order ?? 0,
    };
    try {
      if (modal.item) await apiPut(`/api/business/content/${modal.item.id}`, payload);
      else await apiPost("/api/business/content", payload);
      setModal(null);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar "${modal.item.title}"?`)) return;
    await apiDelete(`/api/business/content/${modal.item.id}`);
    setModal(null);
    refresh();
  };

  const moveTo = async (ideaId, status) => {
    // optimista
    setIdeas((prev) => prev.map((i) => (i.id === ideaId ? { ...i, status } : i)));
    try {
      await apiPost(`/api/business/content/${ideaId}/status`, { status });
    } finally {
      refresh();
    }
  };

  const onDrop = (e, status) => {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    if (id) moveTo(id, status);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-soft">
          Arrastra las tarjetas entre columnas para avanzar el pipeline.
        </p>
        <Button onClick={() => setModal({ status: "idea" })}>＋ Idea de video</Button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STATUSES.map((st) => {
          const column = ideas.filter((i) => i.status === st.key);
          return (
            <div
              key={st.key}
              className={`flex w-56 shrink-0 flex-col gap-2 rounded-2xl border p-2.5 transition ${
                dragOver === st.key
                  ? "border-accent bg-accent-soft/60"
                  : "border-glass-border bg-surface/40"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(st.key);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => onDrop(e, st.key)}
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold">{st.label}</span>
                <span className="rounded-full bg-ink/5 px-1.5 text-[10px] text-ink-soft">
                  {column.length}
                </span>
              </div>

              {column.map((idea) => (
                <div
                  key={idea.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", String(idea.id))}
                  onClick={() => setModal({ item: idea })}
                  className="glass cursor-grab p-2.5 !rounded-xl transition hover:bg-surface/80 active:cursor-grabbing"
                >
                  <p className="text-sm font-medium leading-snug">{idea.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {idea.format && (
                      <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
                        {FORMATS.find((f) => f.value === idea.format)?.label || idea.format}
                      </span>
                    )}
                    {idea.platforms.map((p) => (
                      <span key={p} title={p} className="text-xs">
                        {platformIcon(p)}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-soft">
                    {idea.publish_date && <span>📅 {idea.publish_date.slice(5, 10)}</span>}
                    {idea.inspiration_url && (
                      <a
                        href={idea.inspiration_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        💡 insp
                      </a>
                    )}
                    {idea.drive_url && (
                      <a
                        href={idea.drive_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        📂 drive
                      </a>
                    )}
                  </div>
                </div>
              ))}

              <button
                className="rounded-xl border border-dashed border-ink/15 py-1.5 text-xs text-ink-soft transition hover:border-accent hover:text-accent"
                onClick={() => setModal({ status: st.key })}
              >
                ＋
              </button>
            </div>
          );
        })}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.item ? "Editar idea" : "Nueva idea de video"}>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Título / idea
            <input className={inputCls} value={form.title || ""} onChange={set("title")} autoFocus />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Status
              <select className={inputCls} value={form.status} onChange={set("status")}>
                {STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Formato
              <select className={inputCls} value={form.format} onChange={set("format")}>
                <option value="">—</option>
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Publicar el
              <input type="date" className={inputCls} value={form.publish_date} onChange={set("publish_date")} />
            </label>
          </div>

          <div className="flex flex-col gap-1.5 text-sm font-medium">
            Publicar en
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePlatform(p.value)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    form.platforms?.includes(p.value)
                      ? "bg-accent text-white"
                      : "bg-ink/5 text-ink-soft hover:bg-accent-soft"
                  }`}
                >
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium">
              URL de inspiración
              <input className={inputCls} value={form.inspiration_url || ""} onChange={set("inspiration_url")} placeholder="https://tiktok.com/…" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Link al Drive
              <input className={inputCls} value={form.drive_url || ""} onChange={set("drive_url")} placeholder="https://drive.google.com/…" />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Notas / guion
            <textarea className={`${inputCls} min-h-20 resize-y`} value={form.notes || ""} onChange={set("notes")} />
          </label>

          {error && <p className="text-sm text-err">{error}</p>}

          <div className="flex justify-between gap-2">
            {modal?.item ? (
              <Button variant="danger" onClick={remove}>
                Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button onClick={save}>Guardar</Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
