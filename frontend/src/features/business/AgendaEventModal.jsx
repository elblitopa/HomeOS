import { useEffect, useState } from "react";
import { apiDelete, apiPost, apiPut, apiUpload } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import { miniatura } from "../../components/ui/Comprobante.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { toInputValue } from "../../lib/constants.js";
import { inputCls } from "../todos/TaskFormModal.jsx";

/** Alta y edición de un evento agendado con un cliente. */
export default function AgendaEventModal({ open, item, contextId, options, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        client_name: item?.client_name || "",
        phone: item?.phone || "",
        amount: item?.amount ?? "",
        deposit: item?.deposit ?? "",
        start: item?.start ? toInputValue(item.start) : "",
        end: item?.end ? toInputValue(item.end) : "",
        place: item?.place || "",
        place_url: item?.place_url || "",
        municipality: item?.municipality || "",
        rentals: item?.rentals || [],
        comments: item?.comments || "",
        image_path: item?.image_path || null,
      });
      setError(null);
    }
  }, [open, item]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleRenta = (opcion) =>
    setForm((f) => ({
      ...f,
      rentals: f.rentals.includes(opcion)
        ? f.rentals.filter((r) => r !== opcion)
        : [...f.rentals, opcion],
    }));

  const subirFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { path } = await apiUpload("/api/uploads/banner", file);
      setForm((f) => ({ ...f, image_path: path }));
    } catch (err) {
      setError(err.message);
    }
  };

  const save = async () => {
    if (!form.client_name.trim() || !form.start) {
      return setError("Cliente y fecha de inicio son obligatorios.");
    }
    if (form.end && form.end <= form.start) {
      return setError("El fin debe ser después del inicio.");
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        context_id: contextId,
        client_name: form.client_name.trim(),
        phone: form.phone.trim() || null,
        amount: Number(form.amount) || 0,
        deposit: Number(form.deposit) || 0,
        start: form.start,
        end: form.end || null,
        place: form.place.trim() || null,
        place_url: form.place_url.trim() || null,
        municipality: form.municipality.trim() || null,
        rentals: form.rentals,
        comments: form.comments.trim() || null,
        image_path: form.image_path,
      };
      if (item) await apiPut(`/api/business/events/${item.id}`, payload);
      else await apiPost("/api/business/events", payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar el evento de "${item.client_name}"?`)) return;
    await apiDelete(`/api/business/events/${item.id}`);
    onSaved();
    onClose();
  };

  // las rentas del evento que ya no estén en el catálogo se pintan igual,
  // marcadas, para poder quitarlas sin perder datos
  const opcionesVisibles = [...(options || [])];
  for (const r of form.rentals || []) {
    if (!opcionesVisibles.includes(r)) opcionesVisibles.push(r);
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={item ? "Editar evento" : "Nuevo evento"}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Cliente
            <input
              className={inputCls}
              value={form.client_name || ""}
              onChange={set("client_name")}
              placeholder="Jaziel Gzz"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Teléfono
            <input
              className={inputCls}
              inputMode="tel"
              value={form.phone || ""}
              onChange={set("phone")}
              placeholder="+52 1 81 ..."
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            A cobrar (MXN)
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className={inputCls}
              value={form.amount ?? ""}
              onChange={set("amount")}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Anticipo
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className={inputCls}
              value={form.deposit ?? ""}
              onChange={set("deposit")}
              placeholder="100"
            />
            <span className="text-[11px] font-normal text-ink-soft">
              Con anticipo, el evento cuenta como reservado.
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Empieza
            <input type="datetime-local" className={inputCls} value={form.start || ""} onChange={set("start")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Termina (opcional)
            <input type="datetime-local" className={inputCls} value={form.end || ""} onChange={set("end")} />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Lugar
            <input
              className={inputCls}
              value={form.place || ""}
              onChange={set("place")}
              placeholder="Quinta Sol y Luna"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Municipio
            <input
              className={inputCls}
              value={form.municipality || ""}
              onChange={set("municipality")}
              placeholder="Monterrey"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Link de maps
          <input
            className={inputCls}
            inputMode="url"
            value={form.place_url || ""}
            onChange={set("place_url")}
            placeholder="https://maps.app.goo.gl/…"
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Renta
          <div className="flex flex-wrap gap-1.5">
            {opcionesVisibles.map((o) => (
              <button
                key={o}
                onClick={() => toggleRenta(o)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  form.rentals?.includes(o)
                    ? "bg-accent text-white"
                    : "bg-ink/5 text-ink-soft hover:bg-ink/10"
                }`}
              >
                {o}
              </button>
            ))}
            {opcionesVisibles.length === 0 && (
              <span className="text-xs font-normal text-ink-soft">
                Sin opciones en el catálogo. Agrégalas con el botón Catálogo.
              </span>
            )}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Comentarios
          <textarea
            className={`${inputCls} min-h-16 resize-y`}
            value={form.comments || ""}
            onChange={set("comments")}
            placeholder="Pago de contado, sin anticipo…"
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Foto (opcional)
          {form.image_path ? (
            <div className="flex items-center gap-2">
              <img
                src={miniatura(form.image_path, 320)}
                alt=""
                className="h-20 rounded-xl object-cover"
              />
              <button
                className="text-err"
                onClick={() => setForm((f) => ({ ...f, image_path: null }))}
                title="Quitar foto"
              >
                ✕
              </button>
            </div>
          ) : (
            <input type="file" accept="image/*" className="text-xs" onChange={subirFoto} />
          )}
        </div>

        {error && <p className="text-sm text-err">{error}</p>}
        <div className="flex justify-between gap-2">
          {item ? (
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
            <Button onClick={save} disabled={!form.client_name?.trim() || !form.start || saving}>
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
