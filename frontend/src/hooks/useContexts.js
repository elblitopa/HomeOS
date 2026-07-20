import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../api/client.js";

export default function useContexts() {
  const [contexts, setContexts] = useState([]);

  const refresh = useCallback(() => {
    apiGet("/api/contexts").then(setContexts).catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  const byId = Object.fromEntries(contexts.map((c) => [c.id, c]));
  return { contexts, byId, refresh };
}
