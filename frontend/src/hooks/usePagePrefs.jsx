import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../api/client.js";
import { POSICION_DEFAULT, normalizarPosicion } from "../lib/pages.js";

/** Preferencias de página (banner, posición del banner, tipografía) para
 *  toda la app.
 *
 *  Se piden UNA vez al cargar (GET /api/page-prefs trae todas las páginas)
 *  y se cachean en contexto: navegar entre páginas no dispara peticiones
 *  nuevas. Viven en el backend porque deben verse igual en PC, iPhone e
 *  iPad — a diferencia del ojo de privacidad de Finanzas, que es por
 *  dispositivo a propósito.
 *
 *  `reposicionando` es el único estado de UI que vive aquí: el menú ••• y el
 *  banner son componentes hermanos (TopBar e Inicio los colocan por
 *  separado), así que "entrar a Reposicionar" tiene que viajar por contexto.
 *  Mientras se arrastra no se toca el backend: el borrador vive en el banner.
 */

const VACIO = { banner_path: null, font: "default", banner_position: POSICION_DEFAULT };

const PagePrefsContext = createContext({
  prefs: {},
  cargado: false,
  update: async () => {},
  reposicionando: null,
  setReposicionando: () => {},
});

export function PagePrefsProvider({ children }) {
  const [prefs, setPrefs] = useState({});
  const [cargado, setCargado] = useState(false);
  // page_key del banner en modo "Reposicionar", o null
  const [reposicionando, setReposicionando] = useState(null);

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

  const value = useMemo(
    () => ({ prefs, cargado, update, reposicionando, setReposicionando }),
    [prefs, cargado, update, reposicionando]
  );
  return <PagePrefsContext.Provider value={value}>{children}</PagePrefsContext.Provider>;
}

/** Las preferencias de UNA página (con defaults) y cómo cambiarlas. */
export function usePagePrefs(pageKey) {
  const { prefs, cargado, update, reposicionando, setReposicionando } = useContext(PagePrefsContext);
  const crudo = (pageKey && prefs[pageKey]) || VACIO;
  // la posición siempre llega normalizada a {x, y}, venga como venga guardada
  const actual = useMemo(
    () => ({ ...crudo, banner_position: normalizarPosicion(crudo.banner_position) }),
    [crudo]
  );
  return {
    prefs: actual,
    cargado,
    setBanner: (path) => update(pageKey, { banner_path: path }),
    setFont: (font) => update(pageKey, { font }),
    setPosition: (pos) => update(pageKey, { banner_position: pos }),
    reposicionando: reposicionando === pageKey,
    empezarReposicion: () => setReposicionando(pageKey),
    terminarReposicion: () => setReposicionando((k) => (k === pageKey ? null : k)),
  };
}
