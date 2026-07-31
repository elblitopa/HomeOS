import { useEffect, useRef, useState } from "react";
import { apiGet } from "../../api/client.js";
import Adjunto from "../../components/ui/Adjunto.jsx";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { fmtMoney, formatDateTime } from "../../lib/constants.js";

const TONOS = {
  ok: "bg-ok/10 text-ok",
  err: "bg-err/10 text-err",
  accent: "bg-accent-soft text-accent",
  neutral: "bg-ink/5 text-ink-soft",
};

const soloFecha = (iso) =>
  new Date(iso).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

function Fila({ campo }) {
  const { label, type, value, hint, icon, color, currency } = campo;

  const valor = () => {
    if (type === "dinero") return fmtMoney(value, currency);
    if (type === "fecha") return formatDateTime(value);
    if (type === "progreso") {
      return (
        <span className="flex items-center justify-end gap-2">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${Math.min(1, value) * 100}%` }}
            />
          </span>
          {Math.round(value * 100)}%
        </span>
      );
    }
    return (
      <span style={color ? { color } : undefined}>
        {icon ? `${icon} ` : ""}
        {value}
      </span>
    );
  };

  if (type === "multilinea") {
    return (
      <div className="flex flex-col gap-1 py-2">
        <span className="text-xs text-ink-soft">{label}</span>
        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm">{value}</p>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-sm text-ink-soft">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium">
        {valor()}
        {hint && <span className="block text-xs font-normal text-ink-soft">{hint}</span>}
      </span>
    </div>
  );
}

/** Detalle de cualquier bloque del calendario.
 *
 *  Se pinta de inmediato con lo que ya trae el item de la agenda (título,
 *  fecha, color) y el fetch al despachador solo lo enriquece — así nunca hay
 *  una ventana vacía esperando. Las tareas y los eventos de Google no pasan
 *  por el servidor: las primeras tienen su propio modal y los segundos ya
 *  viajan completos en la agenda.
 */
export default function ItemDetailModal({
  open,
  item,
  meta,          // {icon, label} del kind
  color,
  contextName,
  onClose,
  onAccion,      // (idAccion, detalle) -> void
}) {
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  // identifica la petición en vuelo: si se abre otro bloque antes de que
  // conteste, la respuesta vieja se descarta en vez de pisar la nueva
  const pedido = useRef(null);

  useEffect(() => {
    setDetalle(null);
    setError(null);
    if (!open || !item) return;
    if (item.kind === "google") return; // se arma con lo que ya traemos

    const clave = `${item.kind}|${item.ref_id}|${item.date}`;
    pedido.current = clave;
    setCargando(true);
    const params = new URLSearchParams({
      kind: item.kind,
      ref_id: String(item.ref_id),
      date: item.date,
    });
    apiGet(`/api/calendar/item?${params}`)
      .then((d) => {
        if (pedido.current !== clave) return;
        setDetalle(d);
      })
      .catch((e) => {
        if (pedido.current !== clave) return;
        setError(e.message);
      })
      .finally(() => {
        if (pedido.current === clave) setCargando(false);
      });
  }, [open, item]);

  if (!item) return null;

  const esGoogle = item.kind === "google";
  // mientras llega el detalle se usa lo que ya tenemos del calendario
  const titulo = detalle?.title || item.title;
  const cuando = detalle?.date || item.date;
  const descripcion = detalle?.description ?? (esGoogle ? item.detail : null);
  const badges = detalle?.badges || [];
  const campos = detalle?.fields || [];
  const media = detalle?.media || [];
  const acciones = esGoogle
    ? [
        ...(item.link ? [{ id: "abrir_google", label: "Abrir en Google", tone: "ghost" }] : []),
        { id: "editar", label: "Editar", tone: "primary" },
      ]
    : detalle?.actions || [];

  return (
    <Modal open={open} onClose={onClose} size="lg" title={`${meta?.icon || ""} ${meta?.label || ""}`}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 h-10 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold leading-tight">{titulo}</h3>
            <p className="text-sm text-ink-soft">
              {item.all_day ? soloFecha(cuando) : formatDateTime(cuando)}
              {contextName ? ` · ${contextName}` : ""}
            </p>
          </div>
          {detalle?.amount && (
            <span
              className={`shrink-0 text-lg font-semibold ${
                detalle.amount.sign === "+"
                  ? "text-ok"
                  : detalle.amount.sign === "-"
                    ? "text-err"
                    : "text-accent"
              }`}
            >
              {detalle.amount.sign === "+" ? "+" : detalle.amount.sign === "-" ? "−" : ""}
              {fmtMoney(detalle.amount.value, detalle.amount.currency)}
            </span>
          )}
        </div>

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((b, i) => (
              <span
                key={i}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  TONOS[b.tone] || TONOS.neutral
                }`}
              >
                {b.text}
              </span>
            ))}
          </div>
        )}

        {detalle?.ocurrencia?.aviso && (
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent">
            {detalle.ocurrencia.aviso}
          </p>
        )}

        {error && (
          <div className="rounded-xl bg-err/10 px-3 py-2 text-sm text-err">
            {error === "Este elemento ya no existe"
              ? "Este elemento ya no existe — quizá lo borraste en otra pestaña."
              : error}
          </div>
        )}

        {descripcion && (
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-ink/5 px-3 py-2 text-sm">
            {descripcion}
          </p>
        )}

        {/* el banner de una meta va a lo ancho; los comprobantes van al final */}
        {media
          .filter((m) => m.role === "banner")
          .map((m, i) => (
            <Adjunto key={i} path={m.path} name={m.name} role={m.role} />
          ))}

        {campos.length > 0 && (
          <div className="divide-y divide-ink/5">
            {campos.map((c, i) => (
              <Fila key={i} campo={c} />
            ))}
          </div>
        )}

        {media
          .filter((m) => m.role !== "banner")
          .map((m, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <span className="text-xs text-ink-soft">
                {m.role === "audio" ? "Nota de voz" : "Comprobante"}
              </span>
              <Adjunto path={m.path} name={m.name} role={m.role} />
            </div>
          ))}

        {cargando && !detalle && (
          <p className="text-xs text-ink-soft">Cargando el resto…</p>
        )}

        {acciones.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {acciones.map((a) => (
              <Button
                key={a.id}
                variant={a.tone === "primary" ? "primary" : a.tone === "danger" ? "danger" : "ghost"}
                onClick={() => onAccion(a.id, detalle, item)}
                className={a.tone === "ok" ? "!bg-ok/10 !text-ok" : undefined}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
