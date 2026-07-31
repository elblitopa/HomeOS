import { useEffect } from "react";

const ANCHOS = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };

export default function Modal({ open, onClose, title, size = "md", children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`glass max-h-[90vh] w-full overflow-y-auto bg-surface/90 p-6 ${
          ANCHOS[size] || ANCHOS.md
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-ink-soft transition hover:bg-ink/5"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
