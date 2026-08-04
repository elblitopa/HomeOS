import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useMediaQuery from "../../hooks/useMediaQuery.js";

/** El teléfono del cliente como link con menú: Mensaje por WhatsApp y, solo
 *  en el celular, Llamar (en la PC un tel: no lleva a ningún lado útil).
 *
 *  El menú va en un portal con position fixed: la tabla de la Agenda scrollea
 *  horizontal y un absolute normal quedaría recortado por el overflow.
 *  Los números de 10 dígitos se asumen de México (wa.me exige país).
 */
export default function TelefonoCliente({ phone, className = "" }) {
  const [pos, setPos] = useState(null); // null = cerrado
  const menuRef = useRef(null);
  const movil = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    if (!pos) return;
    const cerrar = (e) => {
      if (!menuRef.current?.contains(e.target)) setPos(null);
    };
    const timer = setTimeout(() => document.addEventListener("pointerdown", cerrar), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", cerrar);
    };
  }, [pos]);

  if (!phone) return null;
  const digitos = phone.replace(/\D/g, "");
  const conPais = digitos.length === 10 ? `52${digitos}` : digitos;

  const abrirMenu = (e) => {
    e.stopPropagation(); // que no abra el modal de la fila/tarjeta
    const r = e.currentTarget.getBoundingClientRect();
    setPos((p) => (p ? null : { x: r.left, y: r.bottom + 4 }));
  };

  return (
    <>
      <button className={`text-accent hover:underline ${className}`} onClick={abrirMenu}>
        📞 {phone}
      </button>
      {pos &&
        createPortal(
          <span
            ref={menuRef}
            className="glass fixed z-50 flex w-max flex-col overflow-hidden rounded-xl bg-surface/95 text-sm shadow-lg"
            style={{ left: pos.x, top: pos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <a
              href={`https://wa.me/${conPais}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 transition hover:bg-ink/5"
              onClick={() => setPos(null)}
            >
              💬 Mensaje por WhatsApp
            </a>
            {movil && (
              <a
                href={`tel:+${conPais}`}
                className="px-3 py-2 transition hover:bg-ink/5"
                onClick={() => setPos(null)}
              >
                📞 Llamar
              </a>
            )}
          </span>,
          document.body
        )}
    </>
  );
}
