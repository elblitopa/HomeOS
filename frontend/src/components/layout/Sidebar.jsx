import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import usePing from "../../hooks/usePing.js";
import useTheme from "../../hooks/useTheme.js";

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

// en la barra inferior móvil caben 4 + "Más"
const MOBILE_MAIN = ["/", "/calendario", "/tareas", "/finanzas"];

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

function ThemeButton({ className = "" }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className={`rounded-lg px-1 py-0.5 text-sm transition hover:bg-ink/5 ${className}`}
      title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

function MobileNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const main = NAV.filter((n) => MOBILE_MAIN.includes(n.to));
  const extra = NAV.filter((n) => !MOBILE_MAIN.includes(n.to));
  const extraActive = extra.some((n) => n.to === location.pathname);

  return (
    <div className="md:hidden">
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="glass absolute inset-x-3 bottom-20 bg-surface/90 p-2"
            onClick={(e) => e.stopPropagation()}
          >
            {extra.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                    isActive ? "bg-accent text-white" : "text-ink"
                  }`
                }
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-glass-border px-3 py-2.5 text-xs text-ink-soft">
              <span className="flex items-center gap-2">
                <ThemeButton /> Tema
              </span>
              <PingDot />
            </div>
          </div>
        </div>
      )}

      <nav className="glass fixed inset-x-3 bottom-3 z-50 flex justify-around bg-surface/85 px-1 py-1.5">
        {main.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMoreOpen(false)}
            className={({ isActive }) =>
              `flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-medium transition ${
                isActive && !moreOpen ? "bg-accent text-white" : "text-ink-soft"
              }`
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label === "Finanzas & Negocios" ? "Finanzas" : item.label}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen((o) => !o)}
          className={`flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-medium transition ${
            moreOpen || extraActive ? "bg-accent text-white" : "text-ink-soft"
          }`}
        >
          <span className="text-lg leading-none">☰</span>
          Más
        </button>
      </nav>
    </div>
  );
}

export default function Sidebar() {
  return (
    <>
      <aside className="glass m-4 mr-0 flex w-60 shrink-0 flex-col p-4 max-md:hidden">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="text-2xl">🏠</span>
          <span className="text-lg font-semibold tracking-tight">HomeOS</span>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive ? "bg-accent text-white shadow-sm" : "text-ink hover:bg-accent-soft"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex items-center justify-between px-3 py-2 text-xs text-ink-soft">
          <span className="flex items-center gap-2">
            <ThemeButton />
            HomeOS
          </span>
          <PingDot />
        </div>
      </aside>

      <MobileNav />
    </>
  );
}
