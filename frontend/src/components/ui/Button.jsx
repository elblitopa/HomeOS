const VARIANTS = {
  primary:
    "bg-accent text-white hover:bg-accent/90 shadow-sm disabled:bg-accent/40",
  ghost:
    "bg-transparent text-ink hover:bg-ink/5 border border-glass-border disabled:text-ink-soft/50",
  danger:
    "bg-err/10 text-err hover:bg-err/20 disabled:opacity-40",
};

export default function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
