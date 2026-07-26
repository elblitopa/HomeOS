import { useRef, useState } from "react";

/** Reordenar tarjetas arrastrando, con mouse o con el dedo.
 *
 *  Usa eventos de puntero (no el drag & drop de HTML5, que iOS ignora).
 *  Las tarjetas deben llevar data-sort-id y, si hay varios grupos que no
 *  se mezclan entre sí, data-sort-group.
 *
 *  order      -> arreglo de ids en el orden actual (lo controla el padre)
 *  onReorder  -> se llama en cada movimiento, para la vista previa en vivo
 *  onCommit   -> se llama al soltar, para guardar
 */
export default function useCardSort({ order, onReorder, onCommit }) {
  const [dragging, setDragging] = useState(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  const finish = () => {
    if (!dragging) return;
    setDragging(null);
    onCommit?.(orderRef.current);
  };

  const handleProps = (id, group) => ({
    style: { touchAction: "none", cursor: dragging ? "grabbing" : "grab" },
    onPointerDown: (e) => {
      if (e.button != null && e.button > 0) return; // solo boton principal
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // algunos navegadores rechazan la captura; el arrastre igual funciona
      }
      setDragging({ id: String(id), group: group == null ? null : String(group) });
    },
    onPointerMove: (e) => {
      if (!dragging) return;
      const under = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest?.("[data-sort-id]");
      if (!under) return;

      const overId = under.dataset.sortId;
      if (overId === dragging.id) return;
      // no mezclar tarjetas de grupos distintos (ej. debito con efectivo)
      if (dragging.group != null && under.dataset.sortGroup !== dragging.group) return;

      const list = orderRef.current.map(String);
      const from = list.indexOf(dragging.id);
      const to = list.indexOf(overId);
      if (from < 0 || to < 0) return;

      list.splice(to, 0, list.splice(from, 1)[0]);
      onReorder(list.map(Number));
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onClick: (e) => e.stopPropagation(), // que no abra el modal de edicion
  });

  return { draggingId: dragging?.id ?? null, handleProps };
}
