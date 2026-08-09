/** La píldora de estado de una app.
 *
 *  state: "running" | "stopped" | "starting" | "stopping" | "offline" | "unknown"
 *  (se mantienen las props running/starting de siempre como atajo para no
 *  tocar a los llamadores del modo local).
 */
export default function StatusPill({ running, starting, state }) {
  const s = state || (starting ? "starting" : running ? "running" : "stopped");

  if (s === "starting" || s === "stopping") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
        <span className="pulse-dot h-2 w-2 rounded-full bg-accent" />
        {s === "starting" ? "Iniciando…" : "Deteniendo…"}
      </span>
    );
  }
  if (s === "offline") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-err/10 px-2.5 py-1 text-xs font-medium text-err">
        <span className="h-2 w-2 rounded-full bg-err/70" />
        PC desconectada
      </span>
    );
  }
  if (s === "unknown") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink-soft">
        <span className="h-2 w-2 rounded-full bg-ink-soft/30" />
        Sin datos
      </span>
    );
  }
  return s === "running" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok">
      <span className="h-2 w-2 rounded-full bg-ok" />
      Activo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink-soft">
      <span className="h-2 w-2 rounded-full bg-ink-soft/50" />
      Detenido
    </span>
  );
}
