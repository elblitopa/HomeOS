import GlassCard from "../../components/ui/GlassCard.jsx";
import { miniatura } from "../../components/ui/Comprobante.jsx";
import { fmtMoney, formatDateTime } from "../../lib/constants.js";
import TelefonoCliente from "../../components/ui/TelefonoCliente.jsx";

function TarjetaEvento({ evento, onOpen, pasado }) {
  return (
    <GlassCard
      banner={evento.image_path ? miniatura(evento.image_path, 640) : undefined}
      className={`cursor-pointer transition hover:bg-surface/75 ${pasado ? "opacity-60" : ""}`}
      onClick={() => onOpen(evento)}
    >
      <div className="flex flex-col gap-1 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate font-semibold">{evento.client_name}</span>
          {evento.reserved ? (
            <span className="shrink-0 rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-medium text-ok">
              Reservado {fmtMoney(evento.deposit)}
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium text-ink-soft">
              Sin anticipo
            </span>
          )}
        </div>
        <span className="text-lg font-bold text-accent">{fmtMoney(evento.amount)}</span>
        <span className="text-xs text-ink-soft">
          {formatDateTime(evento.start)}
          {evento.end ? ` → ${formatDateTime(evento.end)}` : ""}
        </span>
        {(evento.place || evento.municipality) && (
          <span className="text-xs text-ink-soft">
            📍{" "}
            {evento.place_url ? (
              <a
                href={evento.place_url}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {evento.place || "Ver en maps"}
              </a>
            ) : (
              evento.place
            )}
            {evento.municipality ? ` · ${evento.municipality}` : ""}
          </span>
        )}
        {evento.phone && (
          <span className="text-xs">
            <TelefonoCliente phone={evento.phone} />
          </span>
        )}
        {(evento.rentals || []).length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {evento.rentals.map((r) => (
              <span key={r} className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                {r}
              </span>
            ))}
          </span>
        )}
        {evento.comments && (
          <span className="mt-1 line-clamp-2 text-xs text-ink-soft">{evento.comments}</span>
        )}
      </div>
    </GlassCard>
  );
}

/** Los eventos como tarjetas: los próximos primero, ideal para el celular. */
export default function AgendaCards({ items, onOpen }) {
  if (items.length === 0) {
    return (
      <GlassCard className="p-8 text-center text-sm text-ink-soft">
        Sin eventos todavía. Agenda el primero con ＋ Evento.
      </GlassCard>
    );
  }

  // days_left lo calcula el backend contra el día local del servidor
  const proximos = items.filter((e) => e.days_left >= 0);
  const pasados = items.filter((e) => e.days_left < 0).reverse(); // el más reciente primero

  return (
    <div className="flex flex-col gap-4">
      {proximos.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">Próximos</p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {proximos.map((e) => (
              <TarjetaEvento key={e.id} evento={e} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}
      {pasados.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-soft">Pasados</p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {pasados.map((e) => (
              <TarjetaEvento key={e.id} evento={e} onOpen={onOpen} pasado />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
