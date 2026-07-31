import { useRef, useState } from "react";
import { createPortal } from "react-dom";

// se exportan para que Adjunto.jsx no duplique la detección de tipo: dos
// copias de estas reglas acabarían desincronizándose
export const ES_IMAGEN = /\.(png|jpe?g|webp|gif|svg|heic|avif|bmp)$/i;
export const ES_VIDEO = /\.(mp4|mov|webm|mkv|avi)$/i;
export const ES_AUDIO = /\.(mp3|wav|ogg|m4a|aac|opus|weba)$/i;
export const ES_PDF = /\.pdf$/i;

const LADO_ZOOM = 280;

/** Los comprobantes vienen de la cámara y pesan varios MB: el servidor los
 *  encoge y cachea para no descargar el original solo para pintar 44 px. */
export const miniatura = (path, ancho) =>
  `/api/uploads/thumb?path=${encodeURIComponent(path)}&w=${ancho}`;

/** Archivo adjunto de una fila: miniatura de 44 px y, si es imagen o video,
 *  una vista grande al pasar el mouse. Lo usan las transacciones y los
 *  movimientos programados.
 *
 *  La vista grande se monta en un portal sobre el body: GlassCard recorta con
 *  overflow-hidden y su backdrop-filter la vuelve bloque contenedor, asi que
 *  un position:fixed adentro se posicionaria contra la tarjeta, no contra la
 *  pantalla, y acabaria fuera de cuadro. */
export default function Comprobante({ path, name }) {
  const [zoom, setZoom] = useState(null);
  const ref = useRef(null);
  const archivo = name || path;
  const imagen = ES_IMAGEN.test(archivo);
  const video = ES_VIDEO.test(archivo);

  const abrir = () => {
    // en pantallas táctiles no hay hover: la miniatura ya se ve y el tap abre
    if ((!imagen && !video) || !window.matchMedia("(hover: hover)").matches) return;
    const r = ref.current.getBoundingClientRect();
    const cabeAbajo = r.bottom + 8 + LADO_ZOOM < window.innerHeight;
    setZoom({
      top: cabeAbajo ? r.bottom + 8 : Math.max(8, r.top - LADO_ZOOM - 8),
      left: Math.min(r.left, window.innerWidth - LADO_ZOOM - 16),
    });
  };

  const miniCls = "h-11 w-11 shrink-0 rounded-lg border border-glass-border object-cover";

  return (
    <a
      ref={ref}
      href={path}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={abrir}
      onMouseLeave={() => setZoom(null)}
      title={name || "comprobante"}
      className="shrink-0"
    >
      {imagen ? (
        <img
          src={miniatura(path, 96)}
          alt={name || "comprobante"}
          loading="lazy"
          className={miniCls}
        />
      ) : video ? (
        <video src={path} muted playsInline className={miniCls} />
      ) : (
        <span
          className={`${miniCls} flex items-center justify-center bg-accent-soft/40 text-lg`}
        >
          {ES_PDF.test(archivo) ? "📕" : "📄"}
        </span>
      )}

      {zoom &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 overflow-hidden rounded-xl border border-glass-border bg-surface shadow-xl"
            style={{ top: zoom.top, left: zoom.left, width: LADO_ZOOM }}
          >
            {imagen ? (
              <img
                src={miniatura(path, 640)}
                alt={name || "comprobante"}
                className="max-h-[280px] w-full object-contain"
              />
            ) : (
              <video
                src={path}
                muted
                autoPlay
                loop
                className="max-h-[280px] w-full object-contain"
              />
            )}
          </div>,
          document.body
        )}
    </a>
  );
}
