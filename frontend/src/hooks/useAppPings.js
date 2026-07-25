import { useEffect, useRef, useState } from "react";

const INTERVAL_MS = 10000;
const TIMEOUT_MS = 4000;

/** Latencia desde ESTE dispositivo hacia cada app activa (clave para Tailscale).
 *  fetch no-cors: no podemos leer la respuesta, pero sí cronometrarla. */
async function pingPort(port) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = performance.now();
  try {
    await fetch(`http://${window.location.hostname}:${port}/`, {
      mode: "no-cors",
      cache: "no-store",
      signal: ctrl.signal,
    });
    return Math.round(performance.now() - t0);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default function useAppPings(apps, status) {
  const [pings, setPings] = useState({});
  const running = useRef({});
  running.current = Object.fromEntries(
    apps.map((a) => [a.id, { port: a.port, up: status[a.id]?.running ?? a.running }])
  );

  useEffect(() => {
    let alive = true;

    const measure = async () => {
      if (document.hidden) return;
      const targets = Object.entries(running.current).filter(([, v]) => v.up);
      const results = await Promise.all(
        targets.map(async ([id, v]) => [id, await pingPort(v.port)])
      );
      if (alive) {
        setPings((prev) => {
          const next = { ...prev };
          for (const [id, ms] of results) next[id] = ms;
          // limpiar apps que ya no corren
          for (const [id, v] of Object.entries(running.current)) {
            if (!v.up) delete next[id];
          }
          return next;
        });
      }
    };

    measure();
    const timer = setInterval(measure, INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return pings;
}
