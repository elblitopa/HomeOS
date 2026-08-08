import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import useContexts from "../../hooks/useContexts.js";
import { CONTEXT_COLORS } from "../../lib/constants.js";
import { inputCls } from "../todos/TaskFormModal.jsx";
import AgentCard from "./AgentCard.jsx";
import GoogleCard from "./GoogleCard.jsx";

export default function SettingsPage() {
  const { contexts, refresh } = useContexts();
  const [webhook, setWebhook] = useState("");
  const [webhookMsg, setWebhookMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(CONTEXT_COLORS[0]);
  const [ctxError, setCtxError] = useState(null);

  const [weekStart, setWeekStart] = useState("monday");

  const [nombre, setNombre] = useState("");
  const [nombreMsg, setNombreMsg] = useState(null);
  const [frases, setFrases] = useState([]);
  const [fijadas, setFijadas] = useState([]);
  const [nuevaFrase, setNuevaFrase] = useState("");
  const [fraseError, setFraseError] = useState(null);

  useEffect(() => {
    apiGet("/api/settings")
      .then((s) => {
        setWebhook(s.discord_webhook_url || "");
        setWeekStart(s.week_starts_on || "monday");
        setNombre(s.user_name || "");
        setFrases(s.quotes_custom || []);
        setFijadas(s.quotes_pinned || []);
      })
      .catch(() => {});
  }, []);

  const guardarNombre = async () => {
    setBusy(true);
    setNombreMsg(null);
    try {
      const s = await apiPut("/api/settings", { user_name: nombre });
      setNombre(s.user_name || "");
      // el saludo de Inicio lee este espejo para no parpadear al abrir
      localStorage.setItem("homeos-nombre", s.user_name || "");
      setNombreMsg({ ok: true, text: "Guardado." });
    } catch (e) {
      setNombreMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const guardarFrases = async (propias, marcadas) => {
    const previas = { propias: frases, marcadas: fijadas };
    setFrases(propias);
    setFijadas(marcadas);
    setFraseError(null);
    try {
      await apiPut("/api/settings", { quotes_custom: propias, quotes_pinned: marcadas });
    } catch (e) {
      setFrases(previas.propias);
      setFijadas(previas.marcadas);
      setFraseError(e.message);
    }
  };

  const agregarFrase = () => {
    const texto = nuevaFrase.trim();
    if (!texto) return;
    setNuevaFrase("");
    guardarFrases([...frases, texto], fijadas);
  };

  const cambiarInicioSemana = async (value) => {
    const previo = weekStart;
    setWeekStart(value); // respuesta inmediata; si falla se revierte
    try {
      await apiPut("/api/settings", { week_starts_on: value });
    } catch {
      setWeekStart(previo);
    }
  };

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
    const aviso = ctx.is_business
      ? `¿Eliminar el negocio "${ctx.name}"?\n\nSe borran también sus proyectos, ` +
        "contenido, competidores, mensajes y documentos. Tareas y transacciones " +
        "quedan sin etiqueta."
      : `¿Eliminar el contexto "${ctx.name}"? Las tareas y eventos quedan sin contexto.`;
    if (!confirm(aviso)) return;
    try {
      await apiDelete(`/api/contexts/${ctx.id}`);
      refresh();
    } catch (e) {
      setCtxError(e.message);
    }
  };

  const toggleBusiness = async (ctx) => {
    setCtxError(null);
    try {
      // nombre y color van porque el PUT los pide; la palomita es lo que cambia
      await apiPut(`/api/contexts/${ctx.id}`, {
        name: ctx.name,
        color: ctx.color,
        is_business: !ctx.is_business,
      });
      refresh();
    } catch (e) {
      setCtxError(e.message);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <TopBar title="Ajustes" />

      <div className="flex max-w-2xl flex-col gap-6">
        <GlassCard className="p-5">
          <h2 className="mb-1 font-semibold">Tu nombre</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Con esto te saluda la pantalla de Inicio.
          </p>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guardarNombre()}
              placeholder="Pablo"
              maxLength={40}
            />
            <Button onClick={guardarNombre} disabled={busy}>
              Guardar
            </Button>
          </div>
          {nombreMsg && (
            <p className={`mt-2 text-sm ${nombreMsg.ok ? "text-ok" : "text-err"}`}>
              {nombreMsg.text}
            </p>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="mb-1 font-semibold">Frases de Inicio</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Cada día sale una distinta. HomeOS trae unas cuantas; aquí puedes agregar las
            tuyas y ver las que guardaste con el pin.
          </p>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={nuevaFrase}
              onChange={(e) => setNuevaFrase(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregarFrase()}
              placeholder="Escribe una frase y presiona Enter"
              maxLength={240}
            />
            <Button onClick={agregarFrase} disabled={!nuevaFrase.trim()}>
              Agregar
            </Button>
          </div>
          {fraseError && <p className="mt-2 text-sm text-err">{fraseError}</p>}

          {frases.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-soft">Tuyas</span>
              {frases.map((f) => (
                <div
                  key={f}
                  className="flex items-start gap-2 rounded-xl border border-glass-border bg-surface/50 px-3 py-2"
                >
                  <span className="flex-1 text-sm">{f}</span>
                  <button
                    className="shrink-0 text-sm text-ink-soft transition hover:text-err"
                    title="Quitar"
                    onClick={() => guardarFrases(frases.filter((x) => x !== f), fijadas)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {fijadas.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-soft">Guardadas con el pin</span>
              {fijadas.map((f) => (
                <div
                  key={f}
                  className="flex items-start gap-2 rounded-xl border border-glass-border bg-surface/50 px-3 py-2"
                >
                  <span className="shrink-0">📌</span>
                  <span className="flex-1 text-sm">{f}</span>
                  <button
                    className="shrink-0 text-sm text-ink-soft transition hover:text-err"
                    title="Quitar de las guardadas"
                    onClick={() => guardarFrases(frases, fijadas.filter((x) => x !== f))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

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

        <GoogleCard />

        <AgentCard />

        <GlassCard className="p-5">
          <h2 className="mb-1 font-semibold">Calendario</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Con qué día quieres que empiece la semana. Aplica en todos tus dispositivos.
          </p>
          <div className="flex gap-1 rounded-xl bg-ink/5 p-1 sm:w-fit">
            {[
              { value: "monday", label: "Lunes" },
              { value: "sunday", label: "Domingo" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => cambiarInicioSemana(opt.value)}
                className={`flex-1 rounded-lg px-6 py-1.5 text-sm font-medium transition ${
                  weekStart === opt.value ? "bg-surface shadow-sm" : "text-ink-soft hover:text-ink"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="mb-1 font-semibold">Contextos</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Tus vistas para filtrar tareas y eventos: Personal, cada negocio, cada proyecto.
            Los marcados con 💼 aparecen como tarjeta en la sección Negocios.
          </p>

          <div className="mb-4 flex flex-col gap-2">
            {contexts.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl border border-glass-border bg-surface/50 px-3 py-2"
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="flex-1 text-sm font-medium">{c.name}</span>
                <label
                  className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-soft"
                  title="Los negocios salen como tarjeta en la sección Negocios"
                >
                  <input
                    type="checkbox"
                    checked={!!c.is_business}
                    onChange={() => toggleBusiness(c)}
                    className="h-3.5 w-3.5 accent-[#2383e2]"
                  />
                  💼 Negocio
                </label>
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
