import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api/client.js";

/** La puerta de entrada en modo cloud.
 *
 *  Pregunta una vez /api/auth/me: en modo local siempre responde 200 y esta
 *  puerta es invisible (HomeOS abre directo, como siempre). En cloud, un 401
 *  —aquí o en cualquier llamada posterior (evento homeos:sin-sesion)— muestra
 *  el login de clave única; la sesión queda en una cookie HttpOnly de larga
 *  vida, así que en el uso normal esta pantalla casi nunca se ve.
 */
export default function LoginGate({ children }) {
  const [estado, setEstado] = useState("cargando"); // cargando | dentro | login
  const [clave, setClave] = useState("");
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    apiGet("/api/auth/me")
      .then(() => setEstado("dentro"))
      .catch(() => setEstado("login"));
  }, []);

  // cualquier 401 posterior (sesión vencida) regresa al login
  useEffect(() => {
    const alPerderSesion = () => setEstado("login");
    window.addEventListener("homeos:sin-sesion", alPerderSesion);
    return () => window.removeEventListener("homeos:sin-sesion", alPerderSesion);
  }, []);

  const entrar = async (e) => {
    e?.preventDefault();
    if (!clave || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await apiPost("/api/auth/login", { key: clave });
      setClave("");
      setEstado("dentro");
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (estado === "dentro") return children;

  if (estado === "cargando") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <p className="text-sm text-ink-soft">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="homeos-bg flex min-h-dvh items-center justify-center p-6">
      <form
        onSubmit={entrar}
        className="glass flex w-full max-w-sm flex-col gap-4 bg-surface/90 p-6"
      >
        <div className="text-center">
          <p className="text-3xl">🏠</p>
          <h1 className="text-xl font-bold">HomeOS</h1>
          <p className="mt-1 text-sm text-ink-soft">Escribe tu clave de acceso</p>
        </div>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-xl border border-glass-border bg-surface/70 px-3 py-2 text-sm outline-none transition focus:border-accent"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          placeholder="Clave"
        />
        {error && <p className="text-center text-sm text-err">{error}</p>}
        <button
          type="submit"
          disabled={!clave || enviando}
          className="rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
