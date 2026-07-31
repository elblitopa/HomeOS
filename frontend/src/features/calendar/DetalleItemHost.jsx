import { KIND } from "../../lib/calendarKinds.js";
import {
  AplazarModal,
  CobrarModal,
  ConcretarModal,
  GoalModal,
  TransactionModal,
} from "../finance/FinanceModals.jsx";
import TaskDetailModal from "../todos/TaskDetailModal.jsx";
import ItemDetailModal from "./ItemDetailModal.jsx";

/** Los modales del detalle, sin lógica propia.
 *
 *  Existe para que cada página que use `useDetalleItem` no tenga que copiar
 *  seis montajes con sus props. Todo lo que recibe sale de `hostProps`.
 */
export default function DetalleItemHost({
  detalleItem,
  tareaId,
  accionFinanzas,
  catalogos,
  contextsById = {},
  colorDe,
  error,
  onCerrarDetalle,
  onCerrarTarea,
  onCerrarAccion,
  onAccion,
  onCambio,
  trasActuar,
  contextos = [],
}) {
  const kindAccion = accionFinanzas?.item?.kind;

  return (
    <>
      <ItemDetailModal
        open={!!detalleItem}
        item={detalleItem}
        meta={detalleItem ? KIND[detalleItem.kind] : null}
        color={detalleItem ? colorDe(detalleItem) : undefined}
        contextName={
          detalleItem?.context_id && contextsById[detalleItem.context_id]
            ? contextsById[detalleItem.context_id].name
            : null
        }
        onClose={onCerrarDetalle}
        onAccion={onAccion}
      />

      {error && (
        <div className="fixed inset-x-4 bottom-24 z-50 rounded-xl bg-err/10 px-4 py-3 text-sm text-err shadow-lg md:inset-x-auto md:right-6">
          {error}
        </div>
      )}

      {tareaId && (
        // espera el mapa por id, no el arreglo: hace contexts[context_id]
        <TaskDetailModal
          todoId={tareaId}
          contexts={contextsById}
          onClose={onCerrarTarea}
          onChanged={onCambio}
        />
      )}

      <ConcretarModal
        open={accionFinanzas?.id === "concretar"}
        item={accionFinanzas?.detalle?.data}
        cuentas={catalogos?.accounts || []}
        tasas={catalogos?.rates || []}
        onClose={onCerrarAccion}
        onSaved={trasActuar}
      />
      <CobrarModal
        open={accionFinanzas?.id === "cobrar"}
        item={accionFinanzas?.detalle?.data}
        kind={kindAccion}
        cuentas={catalogos?.accounts || []}
        tasas={catalogos?.rates || []}
        onClose={onCerrarAccion}
        onSaved={trasActuar}
      />
      <AplazarModal
        open={accionFinanzas?.id === "aplazar"}
        item={accionFinanzas?.detalle?.data}
        onClose={onCerrarAccion}
        onSaved={trasActuar}
      />
      {catalogos && (
        <TransactionModal
          open={
            accionFinanzas?.id === "editar" &&
            ["transaccion", "programado"].includes(kindAccion)
          }
          tx={kindAccion === "transaccion" ? accionFinanzas.detalle?.data : null}
          sched={kindAccion === "programado" ? accionFinanzas.detalle?.data : null}
          accounts={catalogos.accounts}
          categories={catalogos.categories}
          contexts={contextos}
          goals={catalogos.goals}
          rates={catalogos.rates}
          onClose={onCerrarAccion}
          onSaved={trasActuar}
        />
      )}
      <GoalModal
        open={accionFinanzas?.id === "editar" && kindAccion === "meta"}
        goal={accionFinanzas?.detalle?.data}
        onClose={onCerrarAccion}
        onSaved={trasActuar}
      />
    </>
  );
}
