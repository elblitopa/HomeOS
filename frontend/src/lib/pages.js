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

/** Punto focal del banner: {x, y} en porcentajes (50/50 = centro). Es lo que
 *  se guarda en backend y lo que object-position pinta, así la misma zona de
 *  la foto queda visible en móvil y desktop aunque el cover cambie de
 *  proporción. */
export const POSICION_DEFAULT = { x: 50, y: 50 };

const POSICIONES_LEGACY = { center: [50, 50], top: [50, 0], bottom: [50, 100] };

const clamp = (v) => Math.min(100, Math.max(0, v));

/** Normaliza lo que venga del backend (o de una preferencia vieja guardada
 *  como "center"/"top"/"bottom") a {x, y} válidos. */
export function normalizarPosicion(valor) {
  if (typeof valor === "string") {
    const legacy = POSICIONES_LEGACY[valor.trim().toLowerCase()];
    return legacy ? { x: legacy[0], y: legacy[1] } : { ...POSICION_DEFAULT };
  }
  if (valor && Number.isFinite(Number(valor.x)) && Number.isFinite(Number(valor.y))) {
    return { x: clamp(Number(valor.x)), y: clamp(Number(valor.y)) };
  }
  return { ...POSICION_DEFAULT };
}

/** Valor CSS de object-position para una posición normalizada. */
export const objectPosition = (pos) => `${pos.x}% ${pos.y}%`;
