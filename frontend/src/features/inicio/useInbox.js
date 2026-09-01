import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../api/client.js";
import { dayKey } from "../../lib/calendarKinds.js";

const DIAS_VISTA = 7;

/** Cuánto falta, en minutos. Negativo = ya se pasó. Sin fecha va al final. */
function urgencia(iso) {
  if (!iso) return Infinity;
  return (new Date(iso) - Date.now()) / 60000;
}

/** Junta en una sola pila todo lo que hay que atender.
 *
 *  Las tareas y los programados NO se piden por la agenda aunque estén ahí:
 *  la agenda solo trae tareas con fecha límite y solo hacia adelante, así que
 *  se perderían las tareas sin fecha y todo lo ya vencido. Sus endpoints
 *  propios sí traen ambas cosas, con los días restantes ya calculados.
 *
 *  Todo se normaliza a la forma de la agenda ({kind, ref_id, title, date}),
 *  que es justo lo que espera el detalle: así una tarjeta de aquí abre
 *  exactamente lo mismo que un bloque del calendario, sin traducir nada.
 */
export default function useInbox() {
  // null = todavía no contesta. Cada fuente se pinta en cuanto llega en vez
  // de esperar a las cuatro: la agenda sale a los servidores de Google y tarda
  // cerca de un segundo, mientras que las otras tres son de un par de
  // milisegundos. Esperarlas juntas hacía que todo el inbox se sintiera lento.
  const [agenda, setAgenda] = useState(null);
  const [tareas, setTareas] = useState(null);
  const [programados, setProgramados] = useState(null);
  const [rutinas, setRutinas] = useState(null);
  // para la columna de atención: actividades de negocios y suscripciones.
  // Se piden aquí para que la bandeja reuse las MISMAS tareas ya pedidas
  // (una entidad, muchas vistas — nunca un segundo fetch de /api/todos).
  const [proyectos, setProyectos] = useState(null);
  const [suscripciones, setSuscripciones] = useState(null);

  const refresh = useCallback(() => {
    const hoy = new Date();
    const hasta = new Date();
    hasta.setDate(hasta.getDate() + DIAS_VISTA + 1);

    // sin tarea ni programado: se piden aparte para no perder lo vencido
    const kinds = "evento,google,meta,suscripcion,pago";
    const pide = (ruta, set) => apiGet(ruta).then(set).catch(() => set([]));

    pide(`/api/calendar/agenda?from=${dayKey(hoy)}&to=${dayKey(hasta)}&kinds=${kinds}`, setAgenda);
    pide("/api/todos?status=pendiente", setTareas);
    pide("/api/finance/scheduled?status=pendiente", setProgramados);
    pide("/api/routines", setRutinas);
    pide("/api/business/projects", setProyectos);
    pide("/api/finance/subscriptions", setSuscripciones);
  }, []);

  useEffect(refresh, [refresh]);

  const limite = new Date();
  limite.setDate(limite.getDate() + DIAS_VISTA);

  const deTareas = (tareas || [])
    // las que vencen muy adelante no son de "por atender"; las que no tienen
    // fecha sí, que es justo lo que el calendario no puede mostrar
    .filter((t) => !t.due_date || new Date(t.due_date) <= limite)
    .map((t) => ({
      kind: "tarea",
      ref_id: t.id,
      title: t.title,
      date: t.due_date,
      detail: "pendiente",
      context_id: t.context_id,
      priority: t.priority,
      done: false,
    }));

  const deProgramados = (programados || [])
    .filter((p) => p.days_left <= DIAS_VISTA)
    .map((p) => ({
      kind: "programado",
      ref_id: p.id,
      title: p.description,
      date: p.scheduled_for,
      detail: `${p.type === "ingreso" ? "+" : "−"}${p.amount.toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN",
      })} · por confirmar`,
      context_id: p.context_id,
      type: p.type,
    }));

  // dedupe defensivo por si algún día se reagrega un tipo a la cadena de kinds
  const vistos = new Set();
  const todo = [...(agenda || []), ...deTareas, ...deProgramados].filter((i) => {
    const clave = `${i.kind}|${i.ref_id}|${i.date?.slice(0, 10) || ""}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });

  todo.sort((a, b) => {
    const ua = urgencia(a.date);
    const ub = urgencia(b.date);
    if (ua !== ub) return ua - ub;
    return (b.priority || 0) - (a.priority || 0);
  });

  const hoyKey = dayKey(new Date());
  const grupos = [
    {
      key: "vencido",
      titulo: "Vencido",
      tono: "err",
      items: todo.filter((i) => i.date && i.date.slice(0, 10) < hoyKey),
    },
    {
      key: "hoy",
      titulo: "Hoy",
      items: todo.filter((i) => i.date && i.date.slice(0, 10) === hoyKey),
    },
    {
      key: "semana",
      titulo: "Esta semana",
      tope: 5,
      items: todo.filter((i) => i.date && i.date.slice(0, 10) > hoyKey),
    },
    {
      key: "sinfecha",
      titulo: "Sin fecha",
      tope: 3,
      verTodo: "/tareas",
      items: todo.filter((i) => !i.date),
    },
  ].filter((g) => g.items.length > 0);

  return {
    grupos,
    rutinas: rutinas || [],
    // crudos para la bandeja de atención: mismos registros, otra vista
    tareas: tareas || [],
    proyectos: proyectos || [],
    suscripciones: suscripciones || [],
    // solo mientras no ha contestado NADA, que son un par de milisegundos
    cargando: !agenda && !tareas && !programados && !rutinas,
    // el "no hay nada" solo se enseña cuando ya contestaron todas: si no,
    // parpadearía mientras Google sigue en camino
    completo: !!agenda && !!tareas && !!programados && !!rutinas,
    refresh,
  };
}
