/** Los tipos de cosa que viven en el calendario, con su icono y color.
 *
 *  Vive aquí y no dentro de CalendarPage porque también lo usan el hook del
 *  detalle y la sección de Inicio: si cada uno tuviera su copia, agregar un
 *  tipo nuevo obligaría a acordarse de tres sitios.
 *
 *  `on` es solo el estado inicial de los filtros del calendario. Las
 *  transacciones son muchas, así que empiezan apagadas para no saturar.
 */
export const KINDS = [
  { key: "evento", label: "Eventos", icon: "📅", color: "#2383e2", on: true },
  { key: "google", label: "Google", icon: "📆", color: "#ea4335", on: true },
  { key: "tarea", label: "Tareas", icon: "✅", color: "#0ca678", on: true },
  { key: "suscripcion", label: "Suscripciones", icon: "🔁", color: "#9c36b5", on: true },
  { key: "pago", label: "Pagos", icon: "📆", color: "#e8590c", on: true },
  { key: "meta", label: "Metas", icon: "🎯", color: "#f59e0b", on: true },
  { key: "prestamo", label: "Préstamos", icon: "🤝", color: "#7048e8", on: true },
  { key: "nota", label: "Notas", icon: "📝", color: "#6b6b70", on: true },
  { key: "programado", label: "Programados", icon: "🗓️", color: "#0b7285", on: true },
  // OJO: los filtros guardados de antes no incluyen kinds nuevos, asi que el
  // chip de un tipo recien agregado sale apagado hasta prenderlo una vez
  { key: "agenda", label: "Agenda", icon: "🎉", color: "#e64980", on: true },
  { key: "transaccion", label: "Transacciones", icon: "💸", color: "#3b5bdb", on: false },
];

export const KIND = Object.fromEntries(KINDS.map((k) => [k.key, k]));
export const COLORES_BASE = Object.fromEntries(KINDS.map((k) => [k.key, k.color]));

// tipos que se pueden arrastrar a otro dia (los recurrentes y el historial no)
export const MOVABLE = new Set(["evento", "tarea", "google", "meta", "programado", "agenda", "prestamo"]);

const pad = (n) => String(n).padStart(2, "0");

/** Fecha local como YYYY-MM-DD. No sirve toISOString(): da UTC y por la
 *  tarde adelanta el día. */
export const dayKey = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
