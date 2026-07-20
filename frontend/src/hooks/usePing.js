import { useEffect, useState } from "react";

const INTERVAL_MS = 10000;

export default function usePing() {
  const [ms, setMs] = useState(null);

  useEffect(() => {
    let alive = true;

    const measure = async (force = false) => {
      if (document.hidden && !force) return;
      const t0 = performance.now();
      try {
        await fetch("/api/system/ping", { cache: "no-store" });
        if (alive) setMs(Math.round(performance.now() - t0));
      } catch {
        if (alive) setMs(null);
      }
    };

    measure(true);
    const timer = setInterval(() => measure(), INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return ms;
}
