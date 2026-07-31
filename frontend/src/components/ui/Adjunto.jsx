import { useState } from "react";
import { ES_AUDIO, ES_IMAGEN, ES_PDF, ES_VIDEO, miniatura } from "./Comprobante.jsx";

/** Vista previa grande de un archivo, para paneles de detalle.
 *
 *  Es el hermano grande de Comprobante: aquel pinta 44 px dentro de una fila,
 *  este ocupa el ancho del panel. Comparten la detección de tipo.
 *
 *  role: comprobante | banner | audio | entrada — solo cambia el encabezado.
 */
export default function Adjunto({ path, name, role = "comprobante" }) {
  const [fallo, setFallo] = useState(false);
  if (!path) return null;

  // se prueban las dos: el banner de una meta llega con el nombre de la meta,
  // que no tiene extensión, y la buena está en la ruta
  const es = (re) => re.test(name || "") || re.test(path);
  const imagen = es(ES_IMAGEN);
  const video = es(ES_VIDEO);
  const audio = es(ES_AUDIO) || role === "audio";

  // tarjeta de respaldo: documentos, PDFs, y cualquier cosa que el navegador
  // no logre pintar (los .heic del iPhone entran por aquí)
  const Tarjeta = ({ icono, texto }) => (
    <a
      href={path}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-xl border border-glass-border bg-surface/60 px-4 py-3 transition hover:border-accent/40"
    >
      <span className="text-3xl">{icono}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name || "archivo"}</span>
        <span className="block text-xs text-ink-soft">Abrir en una pestaña nueva</span>
      </span>
      {texto && <span className="shrink-0 text-xs text-ink-soft">{texto}</span>}
    </a>
  );

  if (audio) {
    return fallo ? (
      <p className="text-xs text-ink-soft">El audio ya no está disponible.</p>
    ) : (
      <audio controls src={path} onError={() => setFallo(true)} className="w-full" />
    );
  }

  if (imagen && !fallo) {
    return (
      <a href={path} target="_blank" rel="noreferrer" className="block">
        <img
          // el WebP de 640 ya está cacheado por el servidor: pintar el original
          // sería bajar los megas que salieron de la cámara
          src={miniatura(path, 640)}
          alt={name || "archivo"}
          onError={() => setFallo(true)}
          className="max-h-72 w-full rounded-xl border border-glass-border object-contain"
        />
      </a>
    );
  }

  if (video && !fallo) {
    return (
      <video
        src={path}
        controls
        // sin esto el navegador se bajaría el video entero aunque no le des play
        preload="metadata"
        onError={() => setFallo(true)}
        className="max-h-72 w-full rounded-xl border border-glass-border bg-black object-contain"
      />
    );
  }

  return <Tarjeta icono={es(ES_PDF) ? "📕" : "📄"} />;
}
