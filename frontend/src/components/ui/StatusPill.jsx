export default function StatusPill({ running, starting }) {
  if (starting) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
        <span className="pulse-dot h-2 w-2 rounded-full bg-accent" />
        Iniciando…
      </span>
    );
  }
  return running ? (
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
