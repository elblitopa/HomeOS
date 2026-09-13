/** Registro central de las páginas personalizables (banner + tipografía).
 *
 *  Una sola lista para todo: el menú ••• sabe qué páginas existen, la ruta
 *  se traduce a page_key sin condicionales `if pathname === ...` regados, y
 *  el backend (routers/page_prefs.py) valida contra las mismas claves. Las
 *  claves son estables: nunca títulos traducidos ni rutas completas.
 *
 *  Ajustes queda fuera a propósito: es una página funcional, sin banner ni
 *  personalización. Las páginas internas (detalle de cuenta, detalle de
 *  negocio) heredan la TIPOGRAFÍA de su sección por prefijo de ruta, pero no
 *  llevan banner ni menú propio.
 */
export const PAGES = [
  { key: "home", path: "/", label: "Inicio" },
  { key: "finance", path: "/finanzas", label: "Finanzas" },
  { key: "calendar", path: "/calendario", label: "Calendario" },
  { key: "tasks", path: "/tareas", label: "Tareas" },
  { key: "businesses", path: "/negocios", label: "Negocios" },
  { key: "routines", path: "/rutinas", label: "Rutinas" },
  { key: "notes", path: "/notas", label: "Notas" },
  { key: "files", path: "/archivos", label: "Archivos" },
  { key: "apps", path: "/apps", label: "Apps" },
];

export const PAGE_BY_KEY = Object.fromEntries(PAGES.map((p) => [p.key, p]));

export const FONTS = [
  { key: "default", label: "Por defecto", hint: "La de HomeOS" },
  { key: "serif", label: "Serif", hint: "Georgia · Times" },
  { key: "mono", label: "Mono", hint: "Menlo · Consolas" },
];

/** page_key de una ruta, por prefijo más largo ("/" solo exacto). null si
 *  la ruta no pertenece a ninguna página personalizable (p. ej. /ajustes). */
export function pageKeyForPath(pathname) {
  let mejor = null;
  for (const p of PAGES) {
    const coincide = p.path === "/" ? pathname === "/" : pathname === p.path || pathname.startsWith(`${p.path}/`);
    if (coincide && (!mejor || p.path.length > mejor.path.length)) mejor = p;
  }
  return mejor?.key ?? null;
}

/** Clase CSS del contenedor de página según la tipografía elegida. */
export const fontClass = (font) => (font === "serif" || font === "mono" ? `page-font-${font}` : "");
