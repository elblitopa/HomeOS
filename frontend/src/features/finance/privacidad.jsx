import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { fmtMoney } from "../../lib/constants.js";

/** Privacidad de montos en Finanzas: UNA sola fuente de verdad.
 *
 *  El ojo de la cabecera oculta visualmente todas las cifras del módulo
 *  (saldos, totales, transacciones, gráficas). La preferencia es POR
 *  DISPOSITIVO a propósito: vive en localStorage, nunca en la base, para que
 *  la PC pueda mostrar montos mientras el iPhone los esconde.
 *
 *  Es cortina, no cifrado: los valores siguen llegando al cliente; solo se
 *  pintan como puntos. Los componentes piden dinero con money() del hook en
 *  vez de fmtMoney directo. Fuera del provider (p. ej. un modal de Finanzas
 *  abierto desde el calendario) el default muestra los montos normales.
 */

const CLAVE = "homeos-finanzas-privacidad";
const MASCARA = "••••••••";

function leerGuardado() {
  try {
    return localStorage.getItem(CLAVE) === "1";
  } catch {
    return false; // modo privado del navegador, etc.: arrancar visible
  }
}

const PrivacidadContext = createContext({
  oculto: false,
  toggle: () => {},
  money: fmtMoney,
  mask: (texto) => texto,
});

export function PrivacidadProvider({ children }) {
  const [oculto, setOculto] = useState(leerGuardado);

  const toggle = useCallback(() => {
    setOculto((prev) => {
      const siguiente = !prev;
      try {
        localStorage.setItem(CLAVE, siguiente ? "1" : "0");
      } catch {
        /* sin almacenamiento: el estado vive solo esta sesión */
      }
      return siguiente;
    });
  }, []);

  const value = useMemo(
    () => ({
      oculto,
      toggle,
      // reemplazo directo de fmtMoney en las vistas de Finanzas
      money: (amount, currency) => (oculto ? MASCARA : fmtMoney(amount, currency)),
      // para cifras que no pasan por fmtMoney (textos armados a mano)
      mask: (texto) => (oculto ? MASCARA : texto),
    }),
    [oculto, toggle]
  );

  return <PrivacidadContext.Provider value={value}>{children}</PrivacidadContext.Provider>;
}

export function usePrivacidad() {
  return useContext(PrivacidadContext);
}

/** El ojo de la cabecera de Finanzas. */
export function BotonPrivacidad() {
  const { oculto, toggle } = usePrivacidad();
  const etiqueta = oculto ? "Mostrar montos" : "Ocultar montos";
  return (
    <button
      onClick={toggle}
      title={etiqueta}
      aria-label={etiqueta}
      aria-pressed={oculto}
      className="rounded-xl border border-glass-border bg-surface/60 px-3 py-1.5 text-lg leading-none backdrop-blur transition hover:border-accent"
    >
      <span aria-hidden="true">{oculto ? "🙈" : "👁️"}</span>
      <span className="sr-only">{etiqueta}</span>
    </button>
  );
}
