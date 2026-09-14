import { useEffect, useRef, useState } from "react";
import { apiUpload } from "../../api/client.js";
import { miniatura } from "../ui/Comprobante.jsx";
import { usePagePrefs } from "../../hooks/usePagePrefs.jsx";
import { FONTS, PAGE_BY_KEY, objectPosition } from "../../lib/pages.js";

/** Personalización de página al estilo Notion: cover arriba y un menú •••
 *  discreto para cambiar/reposicionar/quitar el banner y elegir la
 *  tipografía.
 *
 *  Son dos piezas sueltas para que TopBar las integre en las páginas
 *  normales e Inicio (que tiene su propio saludo) las coloque a su modo.
 *  Toda la persistencia pasa por usePagePrefs (backend); aquí no hay
 *  estado propio más que "el menú está abierto" y, en modo Reposicionar,
 *  el borrador de la posición mientras se arrastra.
 */

const clamp = (v) => Math.min(100, Math.max(0, v));

/** Cuántos píxeles de imagen sobran en cada eje con object-fit: cover.
 *  Con cover la imagen se escala hasta cubrir el contenedor por el eje más
 *  restrictivo; en el otro eje sobra contenido, y ESO es lo que
 *  object-position desplaza. Si en un eje no sobra nada, ahí no hay nada
 *  que mover. */
function sobrante(img) {
  const { naturalWidth: iw, naturalHeight: ih, clientWidth: cw, clientHeight: ch } = img;
  if (!iw || !ih || !cw || !ch) return { x: 0, y: 0 };
  const escala = Math.max(cw / iw, ch / ih);
  return { x: Math.max(0, iw * escala - cw), y: Math.max(0, ih * escala - ch) };
}

/** El cover de la página. Sin banner no ocupa ni un pixel.
 *
 *  Modo Reposicionar: la misma imagen (la miniatura 1280, nunca el
 *  original) se vuelve arrastrable con Pointer Events. Al arrastrar se
 *  recalcula el punto focal según cuánto sobra realmente de la foto, así el
 *  movimiento sigue al dedo/cursor 1:1. Mientras tanto NO se guarda nada:
 *  `borrador` vive aquí y solo "Guardar posición" hace UN PUT. Cancelar o
 *  Escape vuelven a la posición guardada sin tocar el backend. */
export function PageBanner({ pageKey }) {
  const { prefs, setPosition, reposicionando, terminarReposicion } = usePagePrefs(pageKey);
  const [roto, setRoto] = useState(null);
  const [borrador, setBorrador] = useState(null); // {x, y} solo en modo edición
  const [guardando, setGuardando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false); // la barra se aparta mientras se arrastra
  const [error, setError] = useState(null);
  const imgRef = useRef(null);
  const arrastre = useRef(null); // {pointerId, x0, y0, pos0, sobra}

  const guardada = prefs.banner_position;
  const editando = reposicionando && !!prefs.banner_path;

  // al entrar: copia temporal de la posición guardada; al salir (o si el
  // componente se desmonta por navegar a otra página): se descarta
  useEffect(() => {
    if (!editando) return;
    setBorrador({ ...guardada });
    setError(null);
    return () => {
      setBorrador(null);
      arrastre.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando]);

  // el modo edición no debe sobrevivir a un cambio de página
  useEffect(() => () => terminarReposicion(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelar = () => {
    if (guardando) return;
    setBorrador(null);
    terminarReposicion();
  };

  useEffect(() => {
    if (!editando) return;
    const tecla = (e) => e.key === "Escape" && cancelar();
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, guardando]);

  if (!prefs.banner_path || roto === prefs.banner_path) return null;

  const posicion = editando && borrador ? borrador : guardada;

  const alPresionar = (e) => {
    if (!editando || !imgRef.current) return;
    e.preventDefault();
    const img = imgRef.current;
    try {
      img.setPointerCapture(e.pointerId); // el drag sigue aunque el puntero salga del banner
    } catch {
      // sin captura (puntero sintético o navegador viejo) el drag funciona igual
    }
    arrastre.current = {
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      pos0: { ...posicion },
      sobra: sobrante(img),
    };
    setArrastrando(true);
  };

  const alMover = (e) => {
    const a = arrastre.current;
    if (!a || a.pointerId !== e.pointerId) return;
    e.preventDefault();
    // la imagen se mueve CON el puntero: desplazar la foto d px hacia la
    // derecha equivale a bajar el foco d/sobra*100 puntos porcentuales
    const dx = e.clientX - a.x0;
    const dy = e.clientY - a.y0;
    setBorrador({
      x: a.sobra.x ? clamp(a.pos0.x - (dx / a.sobra.x) * 100) : a.pos0.x,
      y: a.sobra.y ? clamp(a.pos0.y - (dy / a.sobra.y) * 100) : a.pos0.y,
    });
  };

  const alSoltar = (e) => {
    const a = arrastre.current;
    if (!a || a.pointerId !== e.pointerId) return;
    try {
      imgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // nada que soltar si no hubo captura
    }
    arrastre.current = null;
    setArrastrando(false);
  };

  // alternativa accesible al drag: las flechas mueven el foco 2 puntos
  const alTeclear = (e) => {
    if (!editando || !borrador) return;
    const paso = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key];
    if (!paso) return;
    e.preventDefault();
    // funcional: con la tecla repetida los eventos llegan más rápido que el render
    setBorrador((b) => (b ? { x: clamp(b.x + paso[0]), y: clamp(b.y + paso[1]) } : b));
  };

  const guardar = async () => {
    if (!borrador || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      // un solo PUT, con la posición redondeada que el backend guarda
      await setPosition({ x: Math.round(borrador.x), y: Math.round(borrador.y) });
      setBorrador(null);
      terminarReposicion();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const img = (
    <img
      ref={imgRef}
      // miniatura WebP de 1280 (cache privado): nunca el original de varios MB
      src={miniatura(prefs.banner_path, 1280)}
      alt=""
      loading="eager"
      decoding="async"
      draggable={false}
      className={`h-36 w-full rounded-2xl object-cover md:h-52 ${
        editando ? "cursor-grab select-none active:cursor-grabbing" : ""
      }`}
      // fuera de edición la posición guardada es la única fuente de verdad;
      // touch-action: none solo mientras se reposiciona, para que el dedo
      // mueva la foto y no la página (el scroll normal no se toca nunca)
      style={{ objectPosition: objectPosition(posicion), touchAction: editando ? "none" : undefined }}
      onError={() => setRoto(prefs.banner_path)}
      onPointerDown={editando ? alPresionar : undefined}
      onPointerMove={editando ? alMover : undefined}
      onPointerUp={editando ? alSoltar : undefined}
      onPointerCancel={editando ? alSoltar : undefined}
      onKeyDown={editando ? alTeclear : undefined}
      tabIndex={editando ? 0 : undefined}
      role={editando ? "application" : undefined}
      aria-label={editando ? "Modo reposicionar banner. Arrastra la imagen y guarda la posición." : undefined}
    />
  );

  const boton =
    "rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
  // el contenedor existe siempre, para que la <img> no se desmonte (y se
  // vuelva a decodificar) al entrar o salir del modo edición
  return (
    <div className="relative mb-5">
      {img}
      {/* barra flotante DENTRO del banner: no empuja el layout. Fondo glass
          para que se lea igual sobre fotos claras y oscuras; mientras se
          arrastra se desvanece para no tapar la esquina que se encuadra */}
      {editando && (
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-end gap-2 p-3 transition-opacity ${
          arrastrando ? "opacity-0" : "opacity-100"
        }`}
      >
        <span className="glass rounded-lg px-2.5 py-1 text-[11px] text-ink-soft" aria-live="polite">
          {error || "Arrastra la imagen para reposicionarla"}
        </span>
        <div className="glass pointer-events-auto flex gap-1.5 p-1">
          <button type="button" className={`${boton} text-ink hover:bg-ink/5`} onClick={cancelar} disabled={guardando}>
            Cancelar
          </button>
          <button
            type="button"
            className={`${boton} bg-accent text-white shadow-sm hover:bg-accent/90`}
            onClick={guardar}
            disabled={guardando}
          >
            {guardando ? "Guardando…" : "Guardar posición"}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

/** El menú ••• de personalización. Cierra con click fuera, Escape o al
 *  elegir; navegable con teclado (flechas) como un menú nativo. */
export function PageMenu({ pageKey }) {
  const { prefs, setBanner, setFont, empezarReposicion } = usePagePrefs(pageKey);
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
      // mismo endpoint y validación de tipos que los banners de negocios/cuentas.
      // El backend resetea la posición a 50/50: una foto nueva no hereda el
      // encuadre de la anterior
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

  const reposicionar = () => {
    cerrar();
    empezarReposicion(); // el banner entra en modo edición; el borrador vive allá
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
            <button
              role="menuitem"
              className={item}
              disabled={ocupado}
              onClick={reposicionar}
              aria-label={`Reposicionar banner de ${pagina.label}`}
            >
              <span>↕️ Reposicionar</span>
            </button>
          )}
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
