import GlassCard from "../../components/ui/GlassCard.jsx";
import { miniatura } from "../../components/ui/Comprobante.jsx";
import { fmtMoney, formatDateTime } from "../../lib/constants.js";
import TelefonoCliente from "../../components/ui/TelefonoCliente.jsx";

/** La vista tipo Notion: una fila por evento, columnas alineadas. */
export default function AgendaTable({ items, onOpen }) {
  if (items.length === 0) {
    return (
      <GlassCard className="p-8 text-center text-sm text-ink-soft">
        Sin eventos todavía. Agenda el primero con ＋ Evento.
      </GlassCard>
    );
  }

  return (
    <GlassCard className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-xs text-ink-soft">
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">A cobrar</th>
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Lugar</th>
            <th className="px-3 py-2 font-medium">Municipio</th>
            <th className="px-3 py-2 font-medium">Renta</th>
            <th className="px-3 py-2 font-medium">Reservado</th>
            <th className="px-3 py-2 font-medium">Comentarios</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {items.map((e) => (
            <tr key={e.id} className="cursor-pointer transition hover:bg-ink/5" onClick={() => onOpen(e)}>
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-2">
                  {e.image_path && (
                    <img
                      src={miniatura(e.image_path, 96)}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block max-w-44 truncate font-medium">{e.client_name}</span>
                    {e.phone && (
                      <span className="block text-xs">
                        <TelefonoCliente phone={e.phone} />
                      </span>
                    )}
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{fmtMoney(e.amount)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-soft">
                {formatDateTime(e.start)}
                {e.end ? ` → ${formatDateTime(e.end)}` : ""}
              </td>
              <td className="max-w-44 truncate px-3 py-2.5 text-xs text-ink-soft">
                {e.place || "—"}
                {e.place_url && (
                  <a
                    href={e.place_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 text-accent hover:underline"
                    onClick={(ev) => ev.stopPropagation()}
                    title="Abrir en maps"
                  >
                    🔗
                  </a>
                )}
              </td>
              <td className="px-3 py-2.5 text-xs text-ink-soft">{e.municipality || "—"}</td>
              <td className="px-3 py-2.5">
                <span className="flex max-w-44 flex-wrap gap-1">
                  {(e.rentals || []).map((r) => (
                    <span key={r} className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                      {r}
                    </span>
                  ))}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                {e.reserved ? (
                  <span className="font-medium text-ok">✓ {fmtMoney(e.deposit)}</span>
                ) : (
                  <span className="text-ink-soft">—</span>
                )}
              </td>
              <td className="max-w-44 truncate px-3 py-2.5 text-xs text-ink-soft">{e.comments || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
