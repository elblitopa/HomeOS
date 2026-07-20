import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { fmtMoney, formatDateTime } from "../../lib/constants.js";
import { inputCls } from "../todos/TaskFormModal.jsx";

const SECTIONS = [
  { key: "crm", label: "CRM" },
  { key: "competidores", label: "Competidores" },
  { key: "mensajes", label: "Mensajes" },
  { key: "docs", label: "Documentos" },
  { key: "manual", label: "Manual" },
];

// ---------- CRM: finanzas filtradas del negocio ----------

function CrmSection({ contextId, contextsById, version }) {
  const [summary, setSummary] = useState(null);
  const [txs, setTxs] = useState([]);

  useEffect(() => {
    apiGet(`/api/finance/summary?context_id=${contextId}`).then(setSummary).catch(() => {});
    apiGet(`/api/finance/transactions?context_id=${contextId}&limit=50`).then(setTxs).catch(() => {});
  }, [contextId, version]);

  if (!summary) return <p className="text-sm text-ink-soft">Cargando…</p>;

  const totals = Object.values(summary.by_month || {}).reduce(
    (acc, m) => ({ ingresos: acc.ingresos + m.ingresos, egresos: acc.egresos + m.egresos }),
    { ingresos: 0, egresos: 0 }
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <GlassCard className="p-4">
          <p className="text-xs text-ink-soft">Ingresos</p>
          <p className="text-lg font-bold text-ok">{fmtMoney(totals.ingresos)}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs text-ink-soft">Egresos</p>
          <p className="text-lg font-bold text-err">{fmtMoney(totals.egresos)}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs text-ink-soft">Balance</p>
          <p className="text-lg font-bold">{fmtMoney(totals.ingresos - totals.egresos)}</p>
        </GlassCard>
      </div>

      <p className="text-xs text-ink-soft">
        Las transacciones se asignan a este negocio eligiéndolo en el campo "Negocio / contexto" al
        registrarlas en Finanzas.
      </p>

      {txs.length > 0 && (
        <GlassCard className="divide-y divide-ink/5">
          {txs.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{tx.description}</p>
                <p className="text-xs text-ink-soft">{formatDateTime(tx.occurred_at)}</p>
              </div>
              <span className={`font-semibold ${tx.type === "ingreso" ? "text-ok" : "text-err"}`}>
                {tx.type === "ingreso" ? "+" : "−"}
                {fmtMoney(tx.amount)}
              </span>
            </div>
          ))}
        </GlassCard>
      )}
    </div>
  );
}

// ---------- Competidores ----------

function CompetitorsSection({ contextId }) {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    apiGet(`/api/business/competitors?context_id=${contextId}`).then(setItems).catch(() => {});
  }, [contextId]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    if (modal) {
      const c = modal.item;
      setForm({
        name: c?.name || "",
        ads_url: c?.ads_url || "",
        website: c?.website || "",
        socials: c?.socials || "",
        locations: c?.locations || "",
        notes: c?.notes || "",
      });
      setError(null);
    }
  }, [modal]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return setError("Nombre obligatorio.");
    const payload = {
      context_id: contextId,
      name: form.name.trim(),
      ads_url: form.ads_url.trim() || null,
      website: form.website.trim() || null,
      socials: form.socials.trim() || null,
      locations: form.locations.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (modal.item) await apiPut(`/api/business/competitors/${modal.item.id}`, payload);
      else await apiPost("/api/business/competitors", payload);
      setModal(null);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (item) => {
    if (!confirm(`¿Eliminar a "${item.name}" del mapa?`)) return;
    await apiDelete(`/api/business/competitors/${item.id}`);
    refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => setModal({})}>＋ Competidor</Button>
      </div>
      {items.length === 0 && (
        <GlassCard className="p-8 text-center text-sm text-ink-soft">
          Mapea a tus competidores: sus anuncios, webs, redes y ubicaciones.
        </GlassCard>
      )}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
        {items.map((c) => (
          <GlassCard key={c.id} className="p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="cursor-pointer font-semibold" onClick={() => setModal({ item: c })}>
                {c.name}
              </h3>
              <button className="text-xs text-ink-soft hover:text-err" onClick={() => remove(c)}>
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {c.ads_url && (
                <a href={c.ads_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  📢 Anuncios
                </a>
              )}
              {c.website && (
                <a href={c.website} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  🌐 Web
                </a>
              )}
            </div>
            {c.socials && <p className="mt-1 whitespace-pre-wrap text-xs text-ink-soft">{c.socials}</p>}
            {c.locations && <p className="mt-1 text-xs text-ink-soft">📍 {c.locations}</p>}
            {c.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-ink-soft">{c.notes}</p>}
          </GlassCard>
        ))}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.item ? "Editar competidor" : "Nuevo competidor"}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nombre
            <input className={inputCls} value={form.name || ""} onChange={set("name")} autoFocus />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Biblioteca de anuncios (URL)
            <input className={inputCls} value={form.ads_url || ""} onChange={set("ads_url")} placeholder="https://www.facebook.com/ads/library/…" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Página web
            <input className={inputCls} value={form.website || ""} onChange={set("website")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Redes sociales
            <textarea className={`${inputCls} min-h-14 resize-y`} value={form.socials || ""} onChange={set("socials")} placeholder="IG: @…, TikTok: @…" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Ubicaciones de locales
            <input className={inputCls} value={form.locations || ""} onChange={set("locations")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Notas
            <textarea className={`${inputCls} min-h-14 resize-y`} value={form.notes || ""} onChange={set("notes")} />
          </label>
          {error && <p className="text-sm text-err">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            <Button onClick={save}>Guardar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------- Mensajes automatizados ----------

function MessagesSection({ contextId }) {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ title: "", body: "" });
  const [copiedId, setCopiedId] = useState(null);

  const refresh = useCallback(() => {
    apiGet(`/api/business/messages?context_id=${contextId}`).then(setItems).catch(() => {});
  }, [contextId]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    if (modal) setForm({ title: modal.item?.title || "", body: modal.item?.body || "" });
  }, [modal]);

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    const payload = { context_id: contextId, title: form.title.trim(), body: form.body };
    if (modal.item) await apiPut(`/api/business/messages/${modal.item.id}`, payload);
    else await apiPost("/api/business/messages", payload);
    setModal(null);
    refresh();
  };

  const remove = async (item) => {
    if (!confirm(`¿Eliminar "${item.title}"?`)) return;
    await apiDelete(`/api/business/messages/${item.id}`);
    refresh();
  };

  const copy = async (item) => {
    await navigator.clipboard.writeText(item.body);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => setModal({})}>＋ Mensaje</Button>
      </div>
      {items.length === 0 && (
        <GlassCard className="p-8 text-center text-sm text-ink-soft">
          Guarda tus mensajes para cada ocasión (bienvenida, seguimiento, envío, cobro…) y cópialos con un click.
        </GlassCard>
      )}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
        {items.map((m) => (
          <GlassCard key={m.id} className="flex flex-col p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="cursor-pointer font-semibold" onClick={() => setModal({ item: m })}>
                {m.title}
              </h3>
              <button className="text-xs text-ink-soft hover:text-err" onClick={() => remove(m)}>
                ✕
              </button>
            </div>
            <p className="mb-3 line-clamp-4 whitespace-pre-wrap text-xs text-ink-soft">{m.body}</p>
            <Button variant="ghost" className="mt-auto" onClick={() => copy(m)}>
              {copiedId === m.id ? "✓ Copiado" : "📋 Copiar"}
            </Button>
          </GlassCard>
        ))}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.item ? "Editar mensaje" : "Nuevo mensaje"}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Título / ocasión
            <input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Confirmación de pedido…" autoFocus />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Mensaje
            <textarea className={`${inputCls} min-h-32 resize-y`} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={!form.title.trim() || !form.body.trim()}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------- Documentos ----------

function DocsSection({ contextId }) {
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    apiGet(`/api/business/docs?context_id=${contextId}`).then(setDocs).catch(() => {});
  }, [contextId]);

  useEffect(refresh, [refresh]);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const up = await apiUpload("/api/uploads/file", file);
      await apiPost("/api/business/docs", {
        context_id: contextId,
        file_path: up.path,
        file_name: up.file_name,
      });
      refresh();
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const remove = async (doc) => {
    if (!confirm(`¿Quitar "${doc.file_name}"?`)) return;
    await apiDelete(`/api/business/docs/${doc.id}`);
    refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent/90">
        {busy ? "Subiendo…" : "＋ Subir documento"}
        <input type="file" className="hidden" onChange={upload} disabled={busy} />
      </label>
      {docs.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-ink-soft">
          Sube contratos, catálogos, fichas técnicas o cualquier documento del negocio.
        </GlassCard>
      ) : (
        <GlassCard className="divide-y divide-ink/5">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
              <span>📄</span>
              <a href={d.file_path} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-accent hover:underline">
                {d.file_name}
              </a>
              <span className="text-xs text-ink-soft">{formatDateTime(d.created_at)}</span>
              <button className="text-xs text-ink-soft hover:text-err" onClick={() => remove(d)}>
                ✕
              </button>
            </div>
          ))}
        </GlassCard>
      )}
    </div>
  );
}

// ---------- Manual de procesos ----------

function ManualSection({ contextId }) {
  const [info, setInfo] = useState({ manual: "", notes: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiGet(`/api/business/info/${contextId}`).then(setInfo).catch(() => {});
  }, [contextId]);

  const save = async () => {
    await apiPut(`/api/business/info/${contextId}`, { manual: info.manual, notes: info.notes });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Manual de procesos
        <textarea
          className={`${inputCls} min-h-48 resize-y font-normal`}
          value={info.manual}
          onChange={(e) => setInfo((i) => ({ ...i, manual: e.target.value }))}
          placeholder={"1. Cómo preparar un pedido…\n2. Cómo responder reclamos…"}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Notas generales
        <textarea
          className={`${inputCls} min-h-24 resize-y font-normal`}
          value={info.notes}
          onChange={(e) => setInfo((i) => ({ ...i, notes: e.target.value }))}
        />
      </label>
      <div className="flex justify-end">
        <Button onClick={save}>{saved ? "✓ Guardado" : "Guardar"}</Button>
      </div>
    </div>
  );
}

// ---------- página ----------

export default function BusinessTab({ contexts, contextsById, version }) {
  const [contextId, setContextId] = useState(null);
  const [section, setSection] = useState("crm");

  useEffect(() => {
    if (!contextId && contexts.length) setContextId(contexts[0].id);
  }, [contexts, contextId]);

  if (contexts.length === 0) {
    return (
      <GlassCard className="p-10 text-center text-sm text-ink-soft">
        Crea tus negocios como <b>contextos</b> en Ajustes (ej. "Perfumes") y aquí verás su CRM,
        competidores, mensajes, documentos y manual.
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {contexts.map((c) => (
          <button
            key={c.id}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              contextId === c.id ? "text-white" : "bg-ink/5 text-ink-soft hover:bg-accent-soft"
            }`}
            style={contextId === c.id ? { backgroundColor: c.color } : {}}
            onClick={() => setContextId(c.id)}
          >
            {c.name}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-ink/10" />
        <div className="flex gap-1 rounded-xl bg-ink/5 p-1">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                section === s.key ? "bg-white shadow-sm" : "text-ink-soft"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {contextId && (
        <>
          {section === "crm" && <CrmSection contextId={contextId} contextsById={contextsById} version={version} />}
          {section === "competidores" && <CompetitorsSection contextId={contextId} />}
          {section === "mensajes" && <MessagesSection contextId={contextId} />}
          {section === "docs" && <DocsSection contextId={contextId} />}
          {section === "manual" && <ManualSection contextId={contextId} />}
        </>
      )}
    </div>
  );
}
