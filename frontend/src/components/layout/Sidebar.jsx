import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import usePing from "../../hooks/usePing.js";
import useTheme from "../../hooks/useTheme.js";

// `short` es la etiqueta de la barra móvil, donde no cabe la larga.
// `end` evita que un enlace quede activo por coincidencia de prefijo: sin él,
// "/" haría match con todas las rutas y el de Inicio siempre se vería activo.
const NAV = [
  { to: "/", label: "Inicio", icon: "🏠", end: true },
  { to: "/calendario", label: "Calendario", icon: "📅" },
  { to: "/tareas", label: "Tareas", icon: "✅" },
  { to: "/finanzas", label: "Finanzas", icon: "💰" },
  { to: "/negocios", label: "Negocios", icon: "💼" },
  { to: "/apps", label: "Apps", icon: "🚀" },
  { to: "/rutinas", label: "Rutinas", icon: "🔁" },
  { to: "/notas", label: "Notas", icon: "📝" },
  { to: "/archivos", label: "Archivos", icon: "📁" },
  { to: "/ajustes", label: "Ajustes", icon: "⚙️" },
];

// en la barra inferior móvil caben 4 + "Más"; el resto se va al menú
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
  // el prefijo tambien cuenta: /negocios/5 debe marcar "Más" como activo,
  // igual que NavLink marca el enlace en desktop
  const extraActive = extra.some(
    (n) => n.to === location.pathname || location.pathname.startsWith(n.to + "/")
  );

  return (
    <div className="md:hidden">
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setMoreOpen(false)}
        >
          {/* con scroll propio: crece hacia arriba y en pantallas cortas o en
              horizontal se saldría de cuadro */}
          <div
            className="glass absolute inset-x-3 max-h-[60dvh] overflow-y-auto bg-surface/90 p-2 [bottom:calc(5rem+env(safe-area-inset-bottom,0px))]"
            onClick={(e) => e.stopPropagation()}
          >
            {extra.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
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

      <nav className="glass fixed inset-x-3 z-50 flex justify-around bg-surface/85 px-1 py-1.5 [bottom:calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        {main.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMoreOpen(false)}
            className={({ isActive }) =>
              `flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-medium transition ${
                isActive && !moreOpen ? "bg-accent text-white" : "text-ink-soft"
              }`
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.short || item.label}
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

export default function Sidebar({ collapsed = false, onToggle }) {
  return (
    <>
      {/* con el panel oculto queda este boton flotante para volver a abrirlo */}
      {collapsed && (
        <button
          onClick={onToggle}
          className="glass fixed left-3 top-3 z-40 px-2.5 py-2 text-sm transition hover:bg-surface/80 max-md:hidden"
          title="Mostrar menú"
        >
          ☰
        </button>
      )}

      <aside
        className={`glass m-4 mr-0 w-60 shrink-0 flex-col p-4 max-md:hidden ${
          collapsed ? "hidden" : "flex"
        }`}
      >
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="text-2xl">🏠</span>
          <span className="flex-1 text-lg font-semibold tracking-tight">HomeOS</span>
          <button
            onClick={onToggle}
            className="rounded-lg px-1.5 py-0.5 text-sm text-ink-soft transition hover:bg-ink/5"
            title="Ocultar menú"
          >
            «
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
