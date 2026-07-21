import { useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiGet } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { formatDateTime } from "../../lib/constants.js";

const KINDS = [
  { key: "", label: "Todos" },
  { key: "imagen", label: "🖼️ Imágenes" },
  { key: "video", label: "🎬 Videos" },
  { key: "audio", label: "🎵 Audio" },
  { key: "documento", label: "📄 Documentos" },
];

const KIND_ICON = { imagen: "🖼️", video: "🎬", audio: "🎵", documento: "📄" };

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function FilesPage() {
  const [files, setFiles] = useState([]);
  const [kind, setKind] = useState("");
  const [uploading, setUploading] = useState(0); // archivos en curso
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const refresh = useCallback(() => {
    const params = kind ? `?kind=${kind}` : "";
    apiGet(`/api/files${params}`).then(setFiles).catch(() => {});
  }, [kind]);

  useEffect(refresh, [refresh]);

  const uploadFiles = async (fileList) => {
    const list = [...fileList];
    if (!list.length) return;
    setError(null);
    setUploading(list.length);
    for (const file of list) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/files", { method: "POST", body: formData });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `Error subiendo ${file.name}`);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setUploading((u) => u - 1);
      }
    }
    refresh();
  };

  const remove = async (f) => {
    if (!confirm(`¿Eliminar "${f.file_name}" definitivamente?`)) return;
    await apiDelete(`/api/files/${f.id}`);
    refresh();
  };

  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);

  return (
    <div
      className="min-h-full p-4 md:p-8"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        uploadFiles(e.dataTransfer.files);
      }}
    >
      <TopBar title="Archivos" subtitle={`${files.length} archivos · ${fmtSize(totalSize)}`}>
        <Button onClick={() => inputRef.current?.click()} disabled={uploading > 0}>
          {uploading > 0 ? `Subiendo ${uploading}…` : "＋ Subir archivos"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </TopBar>

      <div className="mb-4 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              kind === k.key ? "bg-accent text-white" : "bg-ink/5 text-ink-soft hover:bg-accent-soft"
            }`}
            onClick={() => setKind(k.key)}
          >
            {k.label}
          </button>
        ))}
      </div>

      {error && (
        <GlassCard className="mb-4 border-err/30 p-3 text-sm text-err">{error}</GlassCard>
      )}

      {dragging && (
        <GlassCard className="mb-4 border-2 border-dashed border-accent bg-accent-soft/50 p-8 text-center text-accent">
          Suelta los archivos aquí 📥
        </GlassCard>
      )}

      {files.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-2 p-12 text-center">
          <span className="text-4xl">📁</span>
          <p className="font-medium">Tu biblioteca está vacía</p>
          <p className="text-sm text-ink-soft">
            Sube fotos, videos o documentos — también puedes arrastrarlos aquí.
          </p>
        </GlassCard>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
          {files.map((f) => (
            <GlassCard key={f.id} className="group flex flex-col overflow-hidden">
              <a href={f.file_path} target="_blank" rel="noreferrer" className="block">
                {f.kind === "imagen" ? (
                  <div
                    className="h-32 w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${f.file_path})` }}
                  />
                ) : f.kind === "video" ? (
                  <video src={f.file_path} className="h-32 w-full object-cover" muted />
                ) : (
                  <div className="flex h-32 w-full items-center justify-center bg-accent-soft/40 text-4xl">
                    {KIND_ICON[f.kind] || "📄"}
                  </div>
                )}
              </a>
              <div className="flex items-start justify-between gap-1 p-2.5">
                <div className="min-w-0">
                  <a
                    href={f.file_path}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs font-medium hover:text-accent"
                    title={f.file_name}
                  >
                    {f.file_name}
                  </a>
                  <p className="text-[10px] text-ink-soft">
                    {fmtSize(f.size)} · {formatDateTime(f.created_at)}
                  </p>
                </div>
                <button
                  className="text-xs text-ink-soft opacity-0 transition hover:text-err group-hover:opacity-100"
                  onClick={() => remove(f)}
                  title="Eliminar"
                >
                  🗑
                </button>
              </div>
              {f.kind === "audio" && (
                <audio controls src={f.file_path} className="h-8 w-full px-2 pb-2" />
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
