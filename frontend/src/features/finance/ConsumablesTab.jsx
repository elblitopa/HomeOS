import { useEffect, useState } from "react";
import { apiGet } from "../../api/client.js";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { fmtMoney } from "../../lib/constants.js";
import { ConsumableModal } from "./FinanceModals.jsx";

/** Consumibles: artículos de compra recurrente (shampoo, creatina, café…).
 *  HomeOS observa las compras reales (egresos ligados por consumable_id) y
 *  deriva la frecuencia y la próxima compra estimada. Es una estimación de
 *  consumo, no una obligación: aquí no hay alertas duras ni vencimientos. */

function fecha(iso) {
  if (!iso) return null;
  // los date-only ("2026-09-12") se anclan a mediodía local: new Date(iso)
  // los tomaría como UTC y en CDMX retrocederían un día
  const d = new Date(iso.length === 10 ? `${iso}T12:00` : iso);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

/** Estado legible respecto a hoy. Suave a propósito: es una estimación. */
function estadoProxima(c) {
  const d = c.days_left;
  if (d === null || d === undefined) return null;
  if (d > 0) return { texto: `Faltan ~${d} día${d === 1 ? "" : "s"}`, cls: "text-ink-soft" };
  if (d === 0) return { texto: "Aprox. hoy", cls: "font-medium text-amber-600" };
  return { texto: `Hace ~${Math.abs(d)} día${d === -1 ? "" : "s"} que se esperaba`, cls: "text-amber-600" };
}

export default function ConsumablesTab({ reload, version }) {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null); // consumible a editar
  const [verArchivados, setVerArchivados] = useState(false);

  useEffect(() => {
    apiGet("/api/finance/consumables?include_archived=true")
      .then(setItems)
      .catch(() => {});
  }, [version]);

  const activos = items.filter((c) => c.active);
  const archivados = items.filter((c) => !c.active);

  const tarjeta = (c) => {
    const estado = estadoProxima(c);
    return (
      <div
        key={c.id}
        className="cursor-pointer rounded-xl border border-glass-border bg-surface/50 p-3 backdrop-blur transition hover:bg-surface/70"
        onClick={() => setModal(c)}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium">
            🧴 {c.name}
            {!c.active && (
              <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-xs font-medium text-ink-soft">
                Archivado
              </span>
            )}
          </p>
          <span className="text-xs text-ink-soft">
            {c.purchase_count} compra{c.purchase_count === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-soft">
          {c.last_purchase_at ? (
            <>
              Última compra: {fecha(c.last_purchase_at)}
              {c.last_amount != null ? ` · ${fmtMoney(c.last_amount)}` : ""}
            </>
          ) : (
            "Sin compras registradas todavía."
          )}
        </p>
        {c.average_interval_days !== null ? (
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-xs text-ink-soft">
              Cada ~{c.average_interval_days} día{c.average_interval_days === 1 ? "" : "s"}
              {" · "}Próxima ≈ {fecha(c.next_estimated_at)}
            </p>
            {estado && <p className={`text-xs ${estado.cls}`}>{estado.texto}</p>}
          </div>
        ) : (
          c.purchase_count === 1 && (
            <p className="mt-1.5 text-xs text-ink-soft">
              Esperando la segunda compra para calcular la frecuencia.
            </p>
          )
        )}
      </div>
    );
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-ink-soft">🧴 Consumibles</h2>
        <p className="text-xs text-ink-soft">
          Se registran desde una transacción: al capturar un egreso, márcalo como
          consumible nuevo o como recompra.
        </p>
      </div>

      {activos.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-ink-soft">
          Sin consumibles todavía. Al registrar un egreso en Transacciones, usa el
          bloque 🧴 Consumible y HomeOS aprenderá cada cuánto lo recompras.
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">{activos.map(tarjeta)}</div>
      )}

      {archivados.length > 0 && (
        <div>
          <button
            className="mb-2 text-xs font-medium text-ink-soft hover:text-ink"
            onClick={() => setVerArchivados((v) => !v)}
          >
            {verArchivados ? "▾" : "▸"} Archivados ({archivados.length})
          </button>
          {verArchivados && <div className="flex flex-col gap-3">{archivados.map(tarjeta)}</div>}
        </div>
      )}

      <ConsumableModal
        open={!!modal}
        item={modal}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null);
          reload();
        }}
      />
    </div>
  );
}
