import { useEffect, useState } from "react";
import { apiGet } from "../api/client.js";

/** El modo de esta instancia: "local" o "cloud".
 *
 *  Sale de /api/auth/me, que ya existe y es la única fuente de verdad:
 *  - local: siempre 200 con mode "local" (no hay auth);
 *  - cloud con sesión: 200 con mode "cloud";
 *  - cloud sin sesión: 401 — que solo puede pasar en cloud.
 *  Se consulta UNA vez por carga y se comparte (promesa cacheada): el modo
 *  no cambia sin reiniciar el backend.
 */
let promesa = null;

export function getMode() {
  if (!promesa) {
    promesa = apiGet("/api/auth/me")
      .then((r) => r.mode || "local")
      .catch(() => "cloud");
  }
  return promesa;
}

export default function useMode() {
  const [mode, setMode] = useState(null); // null mientras carga
  useEffect(() => {
    let alive = true;
    getMode().then((m) => alive && setMode(m));
    return () => {
      alive = false;
    };
  }, []);
  return mode;
}
