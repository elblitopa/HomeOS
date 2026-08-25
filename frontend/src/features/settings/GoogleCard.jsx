import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiPut } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { inputCls } from "../todos/TaskFormModal.jsx";

export default function GoogleCard() {
  const [status, setStatus] = useState(null);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [guia, setGuia] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [espejo, setEspejo] = useState(null);

  const cargar = useCallback(() => {
    apiGet("/api/google/status")
      .then((s) => {
        setStatus(s);
        setClientId(s.client_id || "");
      })
      .catch(() => {});
    apiGet("/api/settings")
      .then((s) =>
        setEspejo({ todos: s.google_sync_todos, finance: s.google_sync_finance })
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    cargar();
    // al volver del callback de Google la URL trae el resultado
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "ok") {
      setMsg({ ok: true, text: "¡Cuenta de Google conectada!" });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("google") === "error") {
      setMsg({ ok: false, text: `No se pudo conectar: ${params.get("detalle") || "error"}` });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [cargar]);

  const guardarCredenciales = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await apiPut("/api/google/credentials", {
        client_id: clientId,
        client_secret: secret,
      });
      setSecret("");
      setMsg({ ok: true, text: "Credenciales guardadas. Ya puedes conectar tu cuenta." });
      cargar();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const conectar = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { url } = await apiGet("/api/google/auth-url");
      window.location.href = url;
    } catch (e) {
      setMsg({ ok: false, text: e.message });
      setBusy(false);
    }
  };

  const desconectar = async () => {
    if (!confirm("¿Desconectar tu cuenta de Google?")) return;
    await apiPost("/api/google/disconnect");
    setMsg({ ok: true, text: "Cuenta desconectada." });
    cargar();
  };

  const elegirCalendario = async (id) => {
    await apiPut("/api/google/calendar", { calendar_id: id });
    cargar();
  };

  const alternarCalendario = async (id, mostrar) => {
    // null significa "todos"; al destildar uno hay que volverlo lista explícita
    const actuales = status.visible_calendars ?? status.calendars.map((c) => c.id);
    const nuevos = mostrar
      ? [...new Set([...actuales, id])]
      : actuales.filter((x) => x !== id);
    setStatus({ ...status, visible_calendars: nuevos }); // respuesta inmediata
    try {
      await apiPut("/api/google/visible-calendars", { calendar_ids: nuevos });
    } finally {
      cargar();
    }
  };

  const alternarEspejo = async (campo, valor) => {
    const key = campo === "todos" ? "google_sync_todos" : "google_sync_finance";
    setEspejo((e) => ({ ...e, [campo]: valor })); // respuesta inmediata
    try {
      await apiPut("/api/settings", { [key]: valor });
    } finally {
      cargar();
    }
  };

  const sincronizar = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiPost("/api/google/sync");
      if (r.error) throw new Error(r.error);
      if (r.omitido) {
        setMsg({ ok: false, text: r.omitido });
        cargar(); // por si el estado acaba de cambiar a "requiere reconexión"
        return;
      }
      const partes = [];
      if (r.creados) partes.push(`${r.creados} creado${r.creados > 1 ? "s" : ""}`);
      if (r.actualizados) partes.push(`${r.actualizados} actualizado${r.actualizados > 1 ? "s" : ""}`);
      if (r.borrados) partes.push(`${r.borrados} quitado${r.borrados > 1 ? "s" : ""}`);
      setMsg({
        ok: !r.errores?.length,
        text: r.errores?.length
          ? `Sincronizado con problemas: ${r.errores[0]}`
          : partes.length
            ? `Google actualizado: ${partes.join(", ")}.`
            : "Google ya estaba al día.",
      });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  // el backend manda el estado real; un token que Google ya rechazó NO es
  // "conectado" aunque siga guardado en la base
  const estado = status.estado || (status.connected ? "conectado" : "no_conectado");

  return (
    <GlassCard className="p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold">📆 Google Calendar</h2>
        {estado === "conectado" && (
          <span className="rounded-full bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok">
            Conectado
          </span>
        )}
        {estado === "requiere_reconexion" && (
          <span className="rounded-full bg-[#f59e0b]/10 px-2.5 py-1 text-xs font-medium text-[#b45309]">
            Requiere reconexión
          </span>
        )}
      </div>
      <p className="mb-3 text-sm text-ink-soft">
        Ve y edita tus eventos de Google desde el calendario de HomeOS.
      </p>

      {estado === "requiere_reconexion" && (
        <div className="mb-3 flex flex-col gap-3 rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-3">
          <p className="text-sm">
            Google caducó la sesión (pasa cada ~7 días mientras la app esté en
            modo Prueba). Tus calendarios, eventos y enlaces siguen guardados:
            solo hay que reconectar y la sincronización retoma sola, sin
            duplicar nada.
          </p>
          <div className="flex gap-2">
            <Button onClick={conectar} disabled={busy}>
              Reconectar Google
            </Button>
            <Button variant="ghost" onClick={desconectar} disabled={busy}>
              Desconectar
            </Button>
          </div>
        </div>
      )}

      {estado === "no_conectado" && (
        <>
          <button
            className="mb-3 text-xs font-medium text-accent hover:underline"
            onClick={() => setGuia((g) => !g)}
          >
            {guia ? "Ocultar" : "¿Cómo obtengo estas credenciales?"}
          </button>
          {guia && (
            <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-ink-soft">
              <li>
                Entra a{" "}
                <a
                  className="text-accent hover:underline"
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Cloud Console → Credenciales
                </a>{" "}
                y crea un proyecto si no tienes.
              </li>
              <li>
                Activa la{" "}
                <a
                  className="text-accent hover:underline"
                  href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Calendar API
                </a>
                .
              </li>
              <li>
                En la pantalla de consentimiento elige <b>Externo</b>, ponle nombre y
                agrégate a ti mismo como usuario de prueba.
              </li>
              <li>
                Crea credenciales → <b>ID de cliente de OAuth</b> → tipo{" "}
                <b>Aplicación web</b>.
              </li>
              <li>
                En <b>URI de redireccionamiento autorizados</b> (no en “Orígenes
                autorizados de JavaScript”) pega exactamente:
                <span className="mt-1 flex items-center gap-2">
                  <code className="flex-1 rounded bg-ink/5 p-1.5 text-[11px]">
                    {status.redirect_uri}
                  </code>
                  <button
                    className="shrink-0 rounded-lg border border-glass-border px-2 py-1 text-[11px] transition hover:border-accent hover:text-accent"
                    onClick={() => {
                      navigator.clipboard?.writeText(status.redirect_uri);
                      setCopiado(true);
                      setTimeout(() => setCopiado(false), 1500);
                    }}
                  >
                    {copiado ? "✓ Copiado" : "Copiar"}
                  </button>
                </span>
              </li>
              <li>Copia el Client ID y el Client Secret aquí abajo.</li>
            </ol>
          )}

          <div className="flex flex-col gap-2">
            <input
              className={inputCls}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Client ID (…apps.googleusercontent.com)"
            />
            <input
              className={inputCls}
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={
                status.has_credentials ? "Client Secret (guardado)" : "Client Secret"
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={guardarCredenciales} disabled={busy || !clientId || !secret}>
                Guardar credenciales
              </Button>
              <Button variant="ghost" onClick={conectar} disabled={busy || !status.has_credentials}>
                Conectar cuenta
              </Button>
            </div>
            <p className="text-[11px] text-ink-soft">
              La conexión se hace desde esta PC: Google solo acepta volver a{" "}
              <code>localhost</code>. Una vez conectada funciona también desde el celular.
            </p>
          </div>
        </>
      )}

      {estado === "conectado" && (
        <div className="flex flex-col gap-3">
          {status.calendars.length > 0 && (
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              Calendarios que se ven en HomeOS
              {status.calendars.map((c) => {
                const visible =
                  status.visible_calendars === null ||
                  status.visible_calendars.includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 text-sm font-normal">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => alternarCalendario(c.id, !visible)}
                      className="h-4 w-4 accent-[#2383e2]"
                    />
                    {c.name}
                    {c.primary && <span className="text-xs text-ink-soft">(principal)</span>}
                  </label>
                );
              })}
            </div>
          )}

          {status.calendars.length > 0 && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Calendario donde se guardan los eventos nuevos
              <select
                className={inputCls}
                value={status.calendar_id}
                onChange={(e) => elegirCalendario(e.target.value)}
              >
                {status.calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.primary ? " (principal)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {/* espejo hacia Google: lo de HomeOS se copia al calendario de
              arriba para que el celular avise por su cuenta */}
          {espejo && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-glass-border bg-surface/50 p-3">
              <span className="text-sm font-medium">Subir a Google</span>
              <p className="text-xs text-ink-soft">
                Se copian al calendario de arriba para que te llegue la notificación al
                celular. Los eventos se eligen uno por uno al crearlos.
              </p>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={espejo.todos}
                  onChange={(e) => alternarEspejo("todos", e.target.checked)}
                  className="h-4 w-4 accent-[#2383e2]"
                />
                Tareas con fecha límite
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={espejo.finance}
                  onChange={(e) => alternarEspejo("finance", e.target.checked)}
                  className="h-4 w-4 accent-[#2383e2]"
                />
                Pagos y suscripciones
              </label>
              <div className="mt-1">
                <Button variant="ghost" onClick={sincronizar} disabled={busy}>
                  {busy ? "Sincronizando…" : "🔄 Sincronizar ahora"}
                </Button>
              </div>
            </div>
          )}

          {status.error && <p className="text-sm text-err">{status.error}</p>}
          <div>
            <Button variant="danger" onClick={desconectar}>
              Desconectar
            </Button>
          </div>
        </div>
      )}

      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-ok" : "text-err"}`}>{msg.text}</p>}
    </GlassCard>
  );
}
