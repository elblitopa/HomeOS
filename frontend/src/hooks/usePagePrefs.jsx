import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../api/client.js";

/** Preferencias de página (banner, tipografía) para toda la app.
 *
 *  Se piden UNA vez al cargar (GET /api/page-prefs trae todas las páginas)
 *  y se cachean en contexto: navegar entre páginas no dispara peticiones
 *  nuevas. Viven en el backend porque deben verse igual en PC, iPhone e
 *  iPad — a diferencia del ojo de privacidad de Finanzas, que es por
 *  dispositivo a propósito.
 */

const VACIO = { banner_path: null, font: "default", banner_position: "center" };

const PagePrefsContext = createContext({
  prefs: {},
  cargado: false,
  update: async () => {},
});

export function PagePrefsProvider({ children }) {
  const [prefs, setPrefs] = useState({});
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    apiGet("/api/page-prefs")
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setCargado(true));
  }, []);

  const update = useCallback(async (pageKey, cambios) => {
    const nuevo = await apiPut(`/api/page-prefs/${pageKey}`, cambios);
    setPrefs((prev) => ({ ...prev, [pageKey]: nuevo }));
    return nuevo;
  }, []);

  const value = useMemo(() => ({ prefs, cargado, update }), [prefs, cargado, update]);
  return <PagePrefsContext.Provider value={value}>{children}</PagePrefsContext.Provider>;
}

/** Las preferencias de UNA página (con defaults) y cómo cambiarlas. */
export function usePagePrefs(pageKey) {
  const { prefs, cargado, update } = useContext(PagePrefsContext);
  const actual = (pageKey && prefs[pageKey]) || VACIO;
  return {
    prefs: actual,
    cargado,
    setBanner: (path) => update(pageKey, { banner_path: path }),
    setFont: (font) => update(pageKey, { font }),
  };
}
