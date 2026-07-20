export const PRIORITIES = [
  { value: 1, label: "Baja", color: "#9ca3af" },
  { value: 2, label: "Media", color: "#2383e2" },
  { value: 3, label: "Alta", color: "#f59e0b" },
  { value: 4, label: "Urgente", color: "#dc2626" },
];

export const REMINDER_OPTIONS = [
  { value: 1440, label: "1 día antes" },
  { value: 360, label: "6 h antes" },
  { value: 180, label: "3 h antes" },
  { value: 60, label: "1 h antes" },
  { value: 30, label: "30 min antes" },
  { value: 10, label: "10 min antes" },
  { value: 5, label: "5 min antes" },
  { value: 0, label: "Al momento" },
];

export const CONTEXT_COLORS = [
  "#2383e2",
  "#0ca678",
  "#f59e0b",
  "#e8590c",
  "#dc2626",
  "#9c36b5",
  "#3b5bdb",
  "#6b6b70",
];

export const priorityOf = (value) =>
  PRIORITIES.find((p) => p.value === value) || PRIORITIES[1];

export function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dueText(iso) {
  if (!iso) return null;
  const diffMs = new Date(iso) - Date.now();
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(mins / 60);
  const days = Math.round(hours / 24);
  let span;
  if (mins < 60) span = `${mins} min`;
  else if (hours < 24) span = `${hours} h`;
  else span = `${days} día${days > 1 ? "s" : ""}`;
  return diffMs < 0
    ? { text: `venció hace ${span}`, overdue: true }
    : { text: `vence en ${span}`, overdue: false };
}

// datetime-local input <-> ISO local sin zona
export const toInputValue = (iso) => (iso ? iso.slice(0, 16) : "");
