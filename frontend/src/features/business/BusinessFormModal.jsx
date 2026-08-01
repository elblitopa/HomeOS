import { useEffect, useState } from "react";
import { apiDelete, apiPost, apiPut, apiUpload } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { inputCls } from "../todos/TaskFormModal.jsx";

const PALETA = [
  "#2383e2", "#0ca678", "#9c36b5", "#e8590c", "#f59e0b",
  "#3b5bdb", "#0b7285", "#e64980", "#6b6b70",
];

/** Alta y edición de un negocio.
 *
 *  Un negocio ES un contexto con la palomita is_business: por eso esto habla
 *  con /api/contexts y no con un endpoint propio. Así lo que ya se etiqueta
 *  por contexto (tareas, transacciones, proveedores) pertenece al negocio
 *  sin volver a vincular nada.
 */
export default function BusinessFormModal({ open, business, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", color: PALETA[0], banner_path: null });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        name: business?.name || "",
        color: business?.color || PALETA[0],
        banner_path: business?.banner_path || null,
      });
      setError(null);
    }
  }, [open, business]);

  const uploadBanner = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { path } = await apiUpload("/api/uploads/banner", file);
      setForm((f) => ({ ...f, banner_path: path }));
    } catch (err) {
      setError(err.message);
    }
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      color: form.color,
      is_business: true,
      banner_path: form.banner_path,
    };
    try {
      if (business) await apiPut(`/api/contexts/${business.id}`, payload);
      else await apiPost("/api/contexts", payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message); // p. ej. el 409 de nombre repetido
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const aviso =
      `¿Eliminar el negocio "${business.name}"?\n\n` +
      "Se borran también sus proyectos, contenido, competidores, mensajes y " +
      "documentos. Sus transacciones y tareas quedan sin etiqueta.";
    if (!confirm(aviso)) return;
    await apiDelete(`/api/contexts/${business.id}`);
    onSaved();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={business ? "Editar negocio" : "Nuevo negocio"}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Perfumes, ShopifyBot…"
            maxLength={60}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Color
          <div className="flex flex-wrap gap-2">
            {PALETA.map((c) => (
              <button
                key={c}
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                className={`h-7 w-7 rounded-full transition ${
                  form.color === c ? "ring-2 ring-offset-2 ring-accent" : ""
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Banner (opcional)
          {form.banner_path ? (
            <div className="flex items-center gap-2">
              <div
                className="h-14 flex-1 rounded-xl bg-cover bg-center"
                style={{ backgroundImage: `url(${form.banner_path})` }}
              />
              <button
                className="text-err"
                onClick={() => setForm((f) => ({ ...f, banner_path: null }))}
                title="Quitar banner"
              >
                ✕
              </button>
            </div>
          ) : (
            <input type="file" accept="image/*" className="text-xs" onChange={uploadBanner} />
          )}
          <span className="text-[11px] font-normal text-ink-soft">
            Ideal 1200 × 400 px. Se recorta al centro para llenar la tarjeta.
          </span>
        </div>

        {error && <p className="text-sm text-err">{error}</p>}

        <div className="flex justify-between gap-2">
          {business ? (
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
            <Button onClick={save} disabled={!form.name.trim() || saving}>
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
