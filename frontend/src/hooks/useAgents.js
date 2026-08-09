import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "../api/client.js";

const POLL_MS = 10000;

/** Las máquinas registradas y su estado, refrescado mientras la página esté
 *  visible. `online` viene YA derivado del backend (last_seen), aquí no se
 *  calcula nada con timestamps.
 *
 *  Con enabled=false (modo local) no hace ni una petición: en local no hay
 *  agentes que consultar y la experiencia debe quedar idéntica a siempre.
 */
export default function useAgents(enabled) {
  const [agents, setAgents] = useState({}); // {device_id: agente}
  const timer = useRef(null);

  const poll = useCallback(async () => {
    if (!enabled || document.hidden) return;
    try {
      const lista = await apiGet("/api/agents");
      setAgents(Object.fromEntries(lista.map((a) => [a.device_id, a])));
    } catch {
      /* el siguiente poll lo reintenta */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    poll();
    timer.current = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, poll]);

  return { agents, refreshAgents: poll };
}
