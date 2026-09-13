import { useEffect, useRef, useState } from "react";
import { apiUpload } from "../../api/client.js";
import { miniatura } from "../ui/Comprobante.jsx";
import { usePagePrefs } from "../../hooks/usePagePrefs.jsx";
import { FONTS, PAGE_BY_KEY } from "../../lib/pages.js";

/** Personalización de página al estilo Notion: cover arriba y un menú •••
 *  discreto para cambiar/quitar el banner y elegir la tipografía.
 *
 *  Son dos piezas sueltas para que TopBar las integre en las páginas
 *  normales e Inicio (que tiene su propio saludo) las coloque a su modo.
 *  Toda la persistencia pasa por usePagePrefs (backend); aquí no hay
 *  estado propio más que "el menú está abierto".
 */

/** El cover de la página. Sin banner no ocupa ni un pixel. */
export function PageBanner({ pageKey }) {
  const { prefs } = usePagePrefs(pageKey);
  const [roto, setRoto] = useState(null);
  if (!prefs.banner_path || roto === prefs.banner_path) return null;
  return (
    <img
      // miniatura WebP de 1280 (cache privado): nunca el original de varios MB
      src={miniatura(prefs.banner_path, 1280)}
      alt=""
      loading="eager"
      decoding="async"
      className="mb-5 h-36 w-full rounded-2xl object-cover md:h-52"
      style={{ objectPosition: prefs.banner_position || "center" }}
      onError={() => setRoto(prefs.banner_path)}
    />
  );
}

/** El menú ••• de personalización. Cierra con click fuera, Escape o al
 *  elegir; navegable con teclado (flechas) como un menú nativo. */
export function PageMenu({ pageKey }) {
  const { prefs, setBanner, setFont } = usePagePrefs(pageKey);
  const [abierto, setAbierto] = useState(false);
  // hacia dónde abre: en móvil la cabecera hace wrap y el ••• puede quedar
  // al lado izquierdo, donde un menú anclado a la derecha se saldría de la
  // pantalla. Se decide al abrir, midiendo dónde quedó el botón.
  const [aLaIzquierda, setALaIzquierda] = useState(false);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const raiz = useRef(null);
  const fileRef = useRef(null);
  const botonRef = useRef(null);
  const pagina = PAGE_BY_KEY[pageKey];

  const alternar = () => {
    const r = botonRef.current?.getBoundingClientRect();
    if (r) setALaIzquierda(r.left < window.innerWidth / 2);
    setAbierto((a) => !a);
  };

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => raiz.current && !raiz.current.contains(e.target) && setAbierto(false);
    const tecla = (e) => {
      if (e.key === "Escape") {
        setAbierto(false);
        botonRef.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = [...(raiz.current?.querySelectorAll('[role="menuitem"],[role="menuitemradio"]') || [])];
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement);
        const siguiente = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[siguiente].focus();
      }
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    // el foco entra al primer elemento del menú
    raiz.current?.querySelector('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  if (!pagina) return null;

  const cerrar = () => setAbierto(false);

  const subir = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOcupado(true);
    setError(null);
    try {
      // mismo endpoint y validación de tipos que los banners de negocios/cuentas
      const { path } = await apiUpload("/api/uploads/banner", file);
      await setBanner(path);
      cerrar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const quitar = async () => {
    setOcupado(true);
    try {
      await setBanner(null); // solo suelta la asociación; el archivo se queda
      cerrar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const elegirFuente = async (font) => {
    try {
      await setFont(font);
      cerrar();
    } catch (err) {
      setError(err.message);
    }
  };

  const item =
    "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-ink/5 focus:bg-ink/5 focus:outline-none";

  return (
    <div ref={raiz} className="relative">
      <button
        ref={botonRef}
        onClick={alternar}
        aria-label={`Personalizar página ${pagina.label}`}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title="Personalizar página"
        className="rounded-xl px-2.5 py-1.5 text-lg leading-none text-ink-soft transition hover:bg-ink/5 hover:text-ink"
      >
        •••
      </button>

      {abierto && (
        <div
          role="menu"
          aria-label={`Personalizar ${pagina.label}`}
          className={`glass absolute z-40 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-2xl p-2 shadow-lg ${
            aLaIzquierda ? "left-0" : "right-0"
          }`}
        >
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            Personalizar página
          </p>

          <p className="px-3 pt-1 text-xs text-ink-soft">Banner</p>
          <button role="menuitem" className={item} disabled={ocupado} onClick={() => fileRef.current?.click()}>
            <span>🖼️ {prefs.banner_path ? "Cambiar banner" : "Agregar banner"}</span>
          </button>
          {prefs.banner_path && (
            <button role="menuitem" className={`${item} text-err`} disabled={ocupado} onClick={quitar}>
              <span>Quitar banner</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={subir} />

          <div className="my-1.5 border-t border-ink/10" />

          <p className="px-3 pt-1 text-xs text-ink-soft">Tipografía</p>
          {FONTS.map((f) => {
            const activa = (prefs.font || "default") === f.key;
            return (
              <button
                key={f.key}
                role="menuitemradio"
                aria-checked={activa}
                className={item}
                onClick={() => elegirFuente(f.key)}
              >
                <span className={f.key === "serif" ? "font-serif" : f.key === "mono" ? "font-mono" : ""}>
                  {f.label}
                </span>
                <span className="text-xs text-ink-soft">{activa ? "✓" : f.hint}</span>
              </button>
            );
          })}

          {error && <p className="px-3 pt-1 text-xs text-err">{error}</p>}
          {ocupado && <p className="px-3 pt-1 text-xs text-ink-soft">Guardando…</p>}
        </div>
      )}
    </div>
  );
}
