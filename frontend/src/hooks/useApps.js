import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "../api/client.js";

const POLL_MS = 5000;

export default function useApps() {
  const [apps, setApps] = useState([]);
  const [status, setStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet("/api/apps");
      setApps(data);
      setStatus(Object.fromEntries(data.map((a) => [a.id, { running: a.running }])));
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const pollStatus = useCallback(async () => {
    if (document.hidden) return;
    try {
      const data = await apiGet("/api/apps/status");
      setStatus(data);
    } catch {
      /* el siguiente poll lo reintenta */
    }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(pollStatus, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) pollStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, pollStatus]);

  return { apps, status, loading, error, refresh, pollStatus };
}
