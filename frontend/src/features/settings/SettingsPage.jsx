import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import useContexts from "../../hooks/useContexts.js";
import { CONTEXT_COLORS } from "../../lib/constants.js";
import { inputCls } from "../todos/TaskFormModal.jsx";

export default function SettingsPage() {
  const { contexts, refresh } = useContexts();
  const [webhook, setWebhook] = useState("");
  const [webhookMsg, setWebhookMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(CONTEXT_COLORS[0]);
  const [ctxError, setCtxError] = useState(null);

  useEffect(() => {
    apiGet("/api/settings")
      .then((s) => setWebhook(s.discord_webhook_url || ""))
      .catch(() => {});
  }, []);

  const saveWebhook = async () => {
    setBusy(true);
    setWebhookMsg(null);
    try {
      await apiPut("/api/settings", { discord_webhook_url: webhook });
      setWebhookMsg({ ok: true, text: "Guardado." });
    } catch (e) {
      setWebhookMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const testWebhook = async () => {
    setBusy(true);
    setWebhookMsg(null);
    try {
      await apiPost("/api/settings/test-webhook");
      setWebhookMsg({ ok: true, text: "¡Mensaje de prueba enviado! Revisa tu Discord." });
    } catch (e) {
      setWebhookMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const addContext = async () => {
    if (!newName.trim()) return;
    setCtxError(null);
    try {
      await apiPost("/api/contexts", { name: newName.trim(), color: newColor });
      setNewName("");
      refresh();
    } catch (e) {
      setCtxError(e.message);
    }
  };

  const removeContext = async (ctx) => {
    if (!confirm(`¿Eliminar el contexto "${ctx.name}"? Las tareas y eventos quedan sin contexto.`))
      return;
    try {
      await apiDelete(`/api/contexts/${ctx.id}`);
      refresh();
    } catch (e) {
      setCtxError(e.message);
    }
  };

  return (
    <div className="p-6 md:p-8">
      <TopBar title="Ajustes" />

      <div className="flex max-w-2xl flex-col gap-6">
        <GlassCard className="p-5">
          <h2 className="mb-1 font-semibold">Notificaciones de Discord</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Pega el webhook de tu servidor (Canal → Ajustes → Integraciones → Webhooks).
            Aquí llegarán los avisos de eventos y tareas.
          </p>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder="https://discord.com/api/webhooks/…"
            />
            <Button onClick={saveWebhook} disabled={busy}>
              Guardar
            </Button>
            <Button variant="ghost" onClick={testWebhook} disabled={busy || !webhook}>
              Probar
            </Button>
          </div>
          {webhookMsg && (
            <p className={`mt-2 text-sm ${webhookMsg.ok ? "text-ok" : "text-err"}`}>
              {webhookMsg.text}
            </p>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="mb-1 font-semibold">Contextos</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Tus vistas para filtrar tareas y eventos: Personal, cada negocio, cada proyecto.
          </p>

          <div className="mb-4 flex flex-col gap-2">
            {contexts.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl border border-glass-border bg-white/50 px-3 py-2"
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="flex-1 text-sm font-medium">{c.name}</span>
                <button
                  className="text-sm text-ink-soft transition hover:text-err"
                  onClick={() => removeContext(c)}
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>
            ))}
            {contexts.length === 0 && (
              <p className="text-sm text-ink-soft">
                Aún no hay contextos. Crea "Personal" y uno por negocio 👇
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${inputCls} !w-48`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre (ej. Personal)"
              onKeyDown={(e) => e.key === "Enter" && addContext()}
            />
            <div className="flex gap-1">
              {CONTEXT_COLORS.map((color) => (
                <button
                  key={color}
                  className={`h-6 w-6 rounded-full transition ${
                    newColor === color ? "ring-2 ring-ink/40 ring-offset-2" : ""
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setNewColor(color)}
                />
              ))}
            </div>
            <Button onClick={addContext} disabled={!newName.trim()}>
              Agregar
            </Button>
          </div>
          {ctxError && <p className="mt-2 text-sm text-err">{ctxError}</p>}
        </GlassCard>
      </div>
    </div>
  );
}
