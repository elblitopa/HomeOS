import { Children, useCallback, useEffect, useRef, useState } from "react";

/** Fila deslizable en horizontal.
 *  En móvil se navega con el dedo; en escritorio con las flechas, porque
 *  el mouse no tiene gesto de swipe. */
export default function Carousel({ children, className = "" }) {
  const ref = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sync]);

  // recalcular si cambia la cantidad de tarjetas
  const count = Children.count(children);
  useEffect(sync, [sync, count]);

  const scrollBy = (dir) => {
    const el = ref.current;
    if (!el) return;
    // avanzar una tarjeta a la vez
    const card = el.firstElementChild;
    const step = card ? card.getBoundingClientRect().width + 12 : el.clientWidth * 0.85;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
    // el scroll suave no siempre emite el evento; refrescar al terminar
    setTimeout(sync, 450);
  };

  const arrow =
    "glass absolute top-1/2 z-10 -translate-y-1/2 px-1.5 py-3 text-sm leading-none bg-surface/85 transition disabled:pointer-events-none disabled:opacity-0 max-md:hidden";

  return (
    <div className={`relative min-w-0 ${className}`}>
      <button
        className={`${arrow} -left-1`}
        onClick={() => scrollBy(-1)}
        disabled={atStart}
        title="Anterior"
      >
        ‹
      </button>

      <div
        ref={ref}
        onScroll={sync}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth"
      >
        {children}
      </div>

      <button
        className={`${arrow} -right-1`}
        onClick={() => scrollBy(1)}
        disabled={atEnd}
        title="Siguiente"
      >
        ›
      </button>
    </div>
  );
}
