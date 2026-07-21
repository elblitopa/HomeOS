import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { inputCls } from "../todos/TaskFormModal.jsx";

function ProviderModal({ open, provider, contexts, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        name: provider?.name || "",
        phone: provider?.phone || "",
        whatsapp: provider?.whatsapp || "",
        email: provider?.email || "",
        website: provider?.website || "",
        links: provider?.links || [],
        attachments: provider?.attachments || [],
        notes: provider?.notes || "",
        context_id: provider?.context_id ?? "",
        newLink: "",
      });
      setError(null);
    }
  }, [open, provider]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const addLink = () => {
    const url = (form.newLink || "").trim();
    if (!url) return;
    setForm((f) => ({ ...f, links: [...f.links, { url }], newLink: "" }));
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await apiUpload("/api/uploads/file", file);
      setForm((f) => ({
        ...f,
        attachments: [...f.attachments, { path: up.path, name: up.file_name }],
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      e.target.value = "";
    }
  };

  const save = async () => {
    if (!form.name.trim()) return setError("El nombre es obligatorio.");
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        links: form.links,
        attachments: form.attachments,
        notes: form.notes.trim() || null,
        context_id: form.context_id ? Number(form.context_id) : null,
      };
      if (provider) await apiPut(`/api/business/providers/${provider.id}`, payload);
      else await apiPost("/api/business/providers", payload);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar al proveedor "${provider.name}"?`)) return;
    await apiDelete(`/api/business/providers/${provider.id}`);
    onSaved();
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={provider ? "Editar proveedor" : "Nuevo proveedor"}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nombre
            <input className={inputCls} value={form.name} onChange={set("name")} autoFocus />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Negocio
            <select className={inputCls} value={form.context_id} onChange={set("context_id")}>
              <option value="">General</option>
              {contexts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Teléfono
            <input className={inputCls} value={form.phone} onChange={set("phone")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            WhatsApp
            <input className={inputCls} value={form.whatsapp} onChange={set("whatsapp")} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email
            <input className={inputCls} value={form.email} onChange={set("email")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Página web
            <input className={inputCls} value={form.website} onChange={set("website")} />
          </label>
        </div>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Links (catálogos en línea, redes…)
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={form.newLink}
              onChange={set("newLink")}
              placeholder="https://…"
              onKeyDown={(e) => e.key === "Enter" && addLink()}
            />
            <Button variant="ghost" onClick={addLink}>
              ＋
            </Button>
          </div>
          {form.links?.map((l, i) => (
            <span key={i} className="flex items-center gap-2 text-xs font-normal">
              🔗{" "}
              <a href={l.url} target="_blank" rel="noreferrer" className="truncate text-accent hover:underline">
                {l.url}
              </a>
              <button
                className="text-err"
                onClick={() => setForm((f) => ({ ...f, links: f.links.filter((_, j) => j !== i) }))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Catálogos / archivos
          <input type="file" className="text-xs" onChange={upload} />
          {form.attachments?.map((a, i) => (
            <span key={i} className="flex items-center gap-2 text-xs font-normal">
              📎{" "}
              <a href={a.path} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                {a.name}
              </a>
              <button
                className="text-err"
                onClick={() =>
                  setForm((f) => ({ ...f, attachments: f.attachments.filter((_, j) => j !== i) }))
                }
              >
                ✕
              </button>
            </span>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Notas (compras hechas, condiciones, precios…)
          <textarea className={`${inputCls} min-h-20 resize-y`} value={form.notes} onChange={set("notes")} />
        </label>

        {error && <p className="text-sm text-err">{error}</p>}
        <div className="flex justify-between gap-2">
          {provider ? (
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

export default function ProvidersTab({ contexts, contextsById, version }) {
  const [providers, setProviders] = useState([]);
  const [contextFilter, setContextFilter] = useState("");
  const [modal, setModal] = useState(null);

  const refresh = useCallback(() => {
    const params = contextFilter ? `?context_id=${contextFilter}` : "";
    apiGet(`/api/business/providers${params}`).then(setProviders).catch(() => {});
  }, [contextFilter]);

  useEffect(refresh, [refresh, version]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`rounded-full px-3 py-1 text-xs font-medium ${!contextFilter ? "bg-accent text-white" : "bg-ink/5 text-ink-soft"}`}
          onClick={() => setContextFilter("")}
        >
          Todos
        </button>
        {contexts.map((c) => (
          <button
            key={c.id}
            className={`rounded-full px-3 py-1 text-xs font-medium ${String(c.id) === contextFilter ? "text-white" : "bg-ink/5 text-ink-soft"}`}
            style={String(c.id) === contextFilter ? { backgroundColor: c.color } : {}}
            onClick={() => setContextFilter(String(c.id) === contextFilter ? "" : String(c.id))}
          >
            {c.name}
          </button>
        ))}
        <div className="ml-auto">
          <Button onClick={() => setModal({})}>＋ Proveedor</Button>
        </div>
      </div>

      {providers.length === 0 ? (
        <GlassCard className="p-10 text-center text-sm text-ink-soft">
          Sin proveedores registrados. Agrega el primero para nunca perder su contacto.
        </GlassCard>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {providers.map((p) => {
            const ctx = p.context_id ? contextsById[p.context_id] : null;
            return (
              <GlassCard key={p.id} className="cursor-pointer p-4 transition hover:bg-surface/75">
                <div onClick={() => setModal({ provider: p })}>
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="font-semibold">{p.name}</h3>
                    {ctx && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] text-white" style={{ backgroundColor: ctx.color }}>
                        {ctx.name}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 text-xs text-ink-soft">
                    {p.phone && <span>📞 {p.phone}</span>}
                    {p.whatsapp && <span>💬 {p.whatsapp}</span>}
                    {p.email && <span>✉️ {p.email}</span>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {p.website && (
                    <a href={p.website} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      🌐 Sitio
                    </a>
                  )}
                  {p.links.map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      🔗 Link {i + 1}
                    </a>
                  ))}
                  {p.attachments.map((a, i) => (
                    <a key={i} href={a.path} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      📎 {a.name}
                    </a>
                  ))}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <ProviderModal
        open={!!modal}
        provider={modal?.provider}
        contexts={contexts}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null);
          refresh();
        }}
      />
    </div>
  );
}
