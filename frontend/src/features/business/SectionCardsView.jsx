import { useRef, useState } from "react";
import { apiUpload } from "../../api/client.js";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { miniatura } from "../../components/ui/Comprobante.jsx";

/** El detalle del negocio como grid de tarjetas: una por sección.
 *
 *  Cada tarjeta puede llevar banner subible para que la portada del negocio
 *  sea visual. El botón de banner va superpuesto y con stopPropagation
 *  (patrón del asa del índice): la tarjeta entera es el botón de navegar.
 */
export default function SectionCardsView({ sections, banners, onOpen, onBannerChange }) {
  const [subiendo, setSubiendo] = useState(null); // key en proceso
  const inputRef = useRef(null);
  const targetRef = useRef(null); // seccion a la que va el archivo elegido

  const elegirArchivo = (key) => {
    targetRef.current = key;
    inputRef.current?.click();
  };

  const subir = async (e) => {
    const file = e.target.files?.[0];
    const key = targetRef.current;
    e.target.value = ""; // re-subir el mismo archivo debe volver a disparar
    if (!file || !key) return;
    setSubiendo(key);
    try {
      const { path } = await apiUpload("/api/uploads/banner", file);
      onBannerChange(key, path);
    } finally {
      setSubiendo(null);
    }
  };

  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {/* un solo input de archivo para todas las tarjetas */}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={subir} />

      {sections.map((s) => {
        const banner = banners[s.key];
        return (
          <GlassCard
            key={s.key}
            banner={banner ? miniatura(banner, 640) : undefined}
            className="relative cursor-pointer transition hover:bg-surface/75"
            onClick={() => onOpen(s.key)}
          >
            <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
              {banner && (
                <button
                  className="rounded-lg bg-surface/70 px-1.5 py-0.5 text-xs text-ink-soft backdrop-blur transition hover:text-err"
                  title="Quitar banner"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBannerChange(s.key, null);
                  }}
                >
                  ✕
                </button>
              )}
              <button
                className="rounded-lg bg-surface/70 px-1.5 py-0.5 text-xs text-ink-soft backdrop-blur transition hover:text-ink"
                title={banner ? "Cambiar banner" : "Ponerle banner"}
                onClick={(e) => {
                  e.stopPropagation();
                  elegirArchivo(s.key);
                }}
              >
                {subiendo === s.key ? "…" : "🖼️"}
              </button>
            </div>
            <div className="p-4">
              <span className="font-medium">{s.label}</span>
              {s.hint && <span className="mt-1 block text-xs text-ink-soft">{s.hint}</span>}
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
