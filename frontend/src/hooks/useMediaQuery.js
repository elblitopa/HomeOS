import { useEffect, useState } from "react";

/** true si el media query aplica, reaccionando a cambios (rotar el iPad,
 *  achicar la ventana). Casi todo lo responsive del panel va con clases
 *  md: de Tailwind; este hook es para cuando el COMPORTAMIENTO cambia por
 *  dispositivo (ej. qué vista sale por default), no solo el estilo. */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    // el evento change de MediaQueryList no siempre dispara en webviews
    // embebidos; el resize de la ventana funge de respaldo
    mq.addEventListener("change", onChange);
    window.addEventListener("resize", onChange);
    onChange();
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, [query]);

  return matches;
}
