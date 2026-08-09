import { useEffect, useState } from "react";
import { apiPost, apiPut, apiUpload } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { mensajeDeBrowse, waitCommand } from "../../lib/agentCommands.js";

const EMPTY = { name: "", folder: "", launcher: "", port: "", icon_path: null, banner_path: null };

export default function AppFormModal({ open, app, mode, agentOnline = true, onClose, onSaved }) {
  const isCloud = mode === "cloud";
  const [form, setForm] = useState(EMPTY);
  const [browse, setBrowse] = useState(null);
  const [browsing, setBrowsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(app ? { ...app, port: String(app.port) } : EMPTY);
      setBrowse(null);
      setError(null);
    }
  }, [open, app]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const aplicarBrowse = (data) => {
    setBrowse(data);
    setForm((f) => ({ ...f, folder: data.path }));
  };

  const doBrowse = async (path) => {
    if (isCloud && !agentOnline) return; // sin PC no hay nada que pedir
    setBrowsing(true);
    setError(null);
    try {
      const data = await apiPost("/api/apps/browse", { path: path ?? form.folder });
      if (data.queued) {
        // cloud: el listado lo produce el Agent; esperar el desenlace real
        const cmd = await waitCommand(data.command_id);
        if (cmd.status !== "done") throw new Error(mensajeDeBrowse(cmd));
        aplicarBrowse(cmd.result);
      } else {
        aplicarBrowse(data); // local: respuesta directa, como siempre
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBrowsing(false);
    }
  };

  const upload = (kind) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const { path } = await apiUpload(`/api/uploads/${kind}`, file);
      setForm((f) => ({ ...f, [kind === "icon" ? "icon_path" : "banner_path"]: path }));
    } catch (err) {
      setError(err.message);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        folder: form.folder.trim(),
        launcher: form.launcher.trim(),
        port: Number(form.port),
        icon_path: form.icon_path,
        banner_path: form.banner_path,
      };
      if (!payload.name || !payload.folder || !payload.launcher || !payload.port) {
        throw new Error("Completa nombre, carpeta, launcher y puerto.");
      }
      if (app) await apiPut(`/api/apps/${app.id}`, payload);
      else await apiPost("/api/apps", payload);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-glass-border bg-surface/70 px-3 py-2 text-sm outline-none transition focus:border-accent";

  return (
    <Modal open={open} onClose={onClose} title={app ? "Editar app" : "Agregar app"}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre
          <input
            className={inputCls}
            value={form.name}
            onChange={set("name")}
            placeholder="AirDrop v2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Carpeta del proyecto
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={form.folder}
              onChange={set("folder")}
              placeholder="C:\Users\pablo\OneDrive\Documents\Proyectos\..."
            />
            <Button
              variant="ghost"
              onClick={() => doBrowse()}
              disabled={browsing || (isCloud && !agentOnline)}
              title={
                isCloud && !agentOnline
                  ? "PC Principal está desconectada. Enciéndela para explorar sus carpetas."
                  : undefined
              }
            >
              {browsing ? "Explorando…" : "Explorar"}
            </Button>
          </div>
          {isCloud && !agentOnline && (
            <span className="text-xs font-normal text-ink-soft">
              PC Principal está desconectada. Enciéndela para explorar sus carpetas.
            </span>
          )}
        </label>

        {browsing && (
          <p className="text-xs text-ink-soft">
            Consultando las carpetas de la PC…
          </p>
        )}

        {browse && (
          <div className="max-h-44 overflow-y-auto rounded-xl border border-glass-border bg-surface/60 p-2 text-sm">
            {browse.parent && (
              <button
                className="block w-full rounded-lg px-2 py-1 text-left hover:bg-accent-soft"
                onClick={() => doBrowse(browse.parent)}
              >
                ⬆️ ..
              </button>
            )}
            {browse.dirs.map((d) => (
              <button
                key={d}
                className="block w-full rounded-lg px-2 py-1 text-left hover:bg-accent-soft"
                onClick={() => doBrowse(`${browse.path}\\${d}`)}
              >
                📁 {d}
              </button>
            ))}
            {browse.bats.map((b) => (
              <button
                key={b}
                className={`block w-full rounded-lg px-2 py-1 text-left hover:bg-accent-soft ${
                  form.launcher === b ? "bg-accent-soft font-medium text-accent" : ""
                }`}
                onClick={() => setForm((f) => ({ ...f, launcher: b }))}
              >
                ⚙️ {b}
              </button>
            ))}
            {browse.dirs.length === 0 && browse.bats.length === 0 && (
              <p className="px-2 py-1 text-ink-soft">Carpeta vacía</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Archivo .bat
            <input
              className={inputCls}
              value={form.launcher}
              onChange={set("launcher")}
              placeholder="iniciar.bat"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Puerto
            <input
              className={inputCls}
              type="number"
              inputMode="numeric"
              value={form.port}
              onChange={set("port")}
              placeholder="7432"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Icono {form.icon_path && "✓"}
            <input type="file" accept="image/*" onChange={upload("icon")} className="text-xs" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Banner {form.banner_path && "✓"}
            <input type="file" accept="image/*" onChange={upload("banner")} className="text-xs" />
          </label>
        </div>

        {isCloud && (
          <p className="rounded-xl bg-ink/5 px-3 py-2 text-xs text-ink-soft">
            Estos datos son la configuración deseada. La PC solo ejecuta lo que
            esté aprobado en su allowlist local: si cambias carpeta o launcher,
            recuerda aprobarlo en la PC con{" "}
            <code>python -m agent approve {app?.slug || "<app>"}</code>.
          </p>
        )}

        {error && <p className="text-sm text-err">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
