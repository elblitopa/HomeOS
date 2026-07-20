import { NavLink } from "react-router-dom";
import usePing from "../../hooks/usePing.js";

const NAV = [
  { to: "/", label: "Apps", icon: "🚀", enabled: true },
  { to: "/calendario", label: "Calendario", icon: "📅", enabled: true },
  { to: "/tareas", label: "Tareas", icon: "✅", enabled: true },
  { to: "/finanzas", label: "Finanzas & Negocios", icon: "💼", enabled: true },
  { to: "/rutinas", label: "Rutinas", icon: "🔁", enabled: true },
  { to: "/notas", label: "Notas", icon: "📝", enabled: true },
  { to: "/archivos", label: "Archivos", icon: "📁", enabled: true },
  { to: "/ajustes", label: "Ajustes", icon: "⚙️", enabled: true },
];

function PingDot() {
  const ms = usePing();
  const color =
    ms === null ? "bg-err" : ms < 60 ? "bg-ok" : ms < 150 ? "bg-amber-500" : "bg-err";
  return (
    <span className="inline-flex items-center gap-1.5" title="Latencia al servidor">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {ms === null ? "sin conexión" : `${ms} ms`}
    </span>
  );
}

export default function Sidebar() {
  return (
    <aside className="glass m-4 mr-0 flex w-60 shrink-0 flex-col p-4 max-md:hidden">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="text-2xl">🏠</span>
        <span className="text-lg font-semibold tracking-tight">HomeOS</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) =>
          item.enabled ? (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-accent text-white shadow-sm"
                    : "text-ink hover:bg-accent-soft"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ) : (
            <div
              key={item.to}
              className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-soft/60"
              title="Próximamente"
            >
              <span className="opacity-50">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              <span className="rounded-full bg-ink/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
                Pronto
              </span>
            </div>
          )
        )}
      </nav>

      <div className="mt-auto flex items-center justify-between px-3 py-2 text-xs text-ink-soft">
        <span>HomeOS · 8777</span>
        <PingDot />
      </div>
    </aside>
  );
}
