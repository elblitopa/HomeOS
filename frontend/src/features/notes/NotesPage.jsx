import { useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import Modal from "../../components/ui/Modal.jsx";
import useContexts from "../../hooks/useContexts.js";
import { formatDateTime } from "../../lib/constants.js";
import { inputCls } from "../todos/TaskFormModal.jsx";

function AudioRecorder({ onReady, onError }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        const ext = (rec.mimeType || "").includes("ogg") ? "ogg" : "webm";
        onReady(new File([blob], `nota-voz-${Date.now()}.${ext}`, { type: blob.type }));
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      onError(
        "No se pudo acceder al micrófono. Si entraste por Tailscale (http), el navegador bloquea el micro: graba en tu dispositivo y sube el archivo de audio."
      );
    }
  };

  const stop = () => {
    clearInterval(timer.current);
    setRecording(false);
    recorder.current?.stop();
  };

  useEffect(() => () => clearInterval(timer.current), []);

  if (!supported) {
    return (
      <p className="text-xs text-ink-soft">
        Este navegador no permite grabar aquí — sube un archivo de audio abajo. 👇
      </p>
    );
  }

  return recording ? (
    <Button variant="danger" onClick={stop}>
      ⏹ Detener ({Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")})
    </Button>
  ) : (
    <Button variant="ghost" onClick={start}>
      🎙️ Grabar audio
    </Button>
  );
}

export default function NotesPage() {
  const { contexts, byId } = useContexts();
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    const params = search ? `?q=${encodeURIComponent(search)}` : "";
    apiGet(`/api/notes${params}`).then(setNotes).catch(() => {});
  }, [search]);

  useEffect(() => {
    const t = setTimeout(refresh, 250); // debounce búsqueda
    return () => clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    if (modal) {
      const n = modal.note;
      setForm({
        title: n?.title || "",
        content: n?.content || "",
        audio_path: n?.audio_path || null,
        context_id: n?.context_id ?? "",
        pinned: n?.pinned || false,
      });
      setError(null);
    }
  }, [modal]);

  const uploadAudio = async (file) => {
    try {
      const up = await apiUpload("/api/uploads/file", file);
      setForm((f) => ({ ...f, audio_path: up.path }));
    } catch (e) {
      setError(e.message);
    }
  };

  const save = async () => {
    if (!form.title.trim()) return setError("Ponle título a la nota.");
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content || null,
        audio_path: form.audio_path,
        context_id: form.context_id ? Number(form.context_id) : null,
        pinned: form.pinned,
      };
      if (modal.note) await apiPut(`/api/notes/${modal.note.id}`, payload);
      else await apiPost("/api/notes", payload);
      setModal(null);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar la nota "${modal.note.title}"?`)) return;
    await apiDelete(`/api/notes/${modal.note.id}`);
    setModal(null);
    refresh();
  };

  const togglePin = async (note, e) => {
    e.stopPropagation();
    await apiPut(`/api/notes/${note.id}`, { ...note, pinned: !note.pinned });
    refresh();
  };

  return (
    <div className="p-6 md:p-8">
      <TopBar title="Notas" subtitle={`${notes.length} notas`}>
        <Button onClick={() => setModal({})}>＋ Nueva nota</Button>
      </TopBar>

      <input
        className={`${inputCls} mb-4 max-w-md`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Buscar en tus notas…"
      />

      {notes.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-2 p-12 text-center">
          <span className="text-4xl">📝</span>
          <p className="font-medium">{search ? "Sin resultados" : "Aún no hay notas"}</p>
          <p className="text-sm text-ink-soft">
            Escribe ideas, apuntes o graba notas de voz.
          </p>
        </GlassCard>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {notes.map((n) => {
            const ctx = n.context_id ? byId[n.context_id] : null;
            return (
              <GlassCard
                key={n.id}
                className="flex cursor-pointer flex-col p-4 transition hover:bg-surface/75"
              >
                <div className="mb-1 flex items-start justify-between gap-2" onClick={() => setModal({ note: n })}>
                  <h3 className="font-semibold leading-tight">
                    {n.audio_path && "🎙️ "}
                    {n.title}
                  </h3>
                  <button
                    className={`text-sm ${n.pinned ? "" : "opacity-30 hover:opacity-100"}`}
                    onClick={(e) => togglePin(n, e)}
                    title={n.pinned ? "Desfijar" : "Fijar"}
                  >
                    📌
                  </button>
                </div>
                <div onClick={() => setModal({ note: n })} className="flex-1">
                  {n.content && (
                    <p className="line-clamp-5 whitespace-pre-wrap text-xs text-ink-soft">{n.content}</p>
                  )}
                </div>
                {n.audio_path && (
                  <audio controls src={n.audio_path} className="mt-2 h-9 w-full" onClick={(e) => e.stopPropagation()} />
                )}
                <p className="mt-2 text-[10px] text-ink-soft">
                  {formatDateTime(n.updated_at)}
                  {ctx ? ` · ${ctx.name}` : ""}
                </p>
              </GlassCard>
            );
          })}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.note ? "Editar nota" : "Nueva nota"}>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Título
            <input
              className={inputCls}
              value={form.title || ""}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Contenido
            <textarea
              className={`${inputCls} min-h-36 resize-y`}
              value={form.content || ""}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            />
          </label>

          <div className="flex flex-col gap-2 text-sm font-medium">
            Audio
            {form.audio_path ? (
              <div className="flex items-center gap-2">
                <audio controls src={form.audio_path} className="h-9 flex-1" />
                <button className="text-err" onClick={() => setForm((f) => ({ ...f, audio_path: null }))}>
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <AudioRecorder onReady={uploadAudio} onError={setError} />
                <label className="cursor-pointer text-xs font-normal text-accent hover:underline">
                  o subir archivo de audio
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadAudio(e.target.files[0])}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Contexto
              <select
                className={inputCls}
                value={form.context_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, context_id: e.target.value }))}
              >
                <option value="">General</option>
                {contexts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={!!form.pinned}
                onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
                className="h-4 w-4 accent-[#2383e2]"
              />
              📌 Fijar arriba
            </label>
          </div>

          {error && <p className="text-sm text-err">{error}</p>}

          <div className="flex justify-between gap-2">
            {modal?.note ? (
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
              <Button onClick={save} disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
