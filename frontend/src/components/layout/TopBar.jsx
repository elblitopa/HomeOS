import { useEffect, useState } from "react";
import { apiGet } from "../../api/client.js";

export default function TopBar({ title, subtitle, children }) {
  const [hostname, setHostname] = useState("");

  useEffect(() => {
    apiGet("/api/system/info")
      .then((info) => setHostname(info.hostname))
      .catch(() => {});
  }, []);

  const today = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm capitalize text-ink-soft">
          {today}
          {hostname ? ` · ${hostname}` : ""}
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}
