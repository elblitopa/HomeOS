/** Los símbolos van dibujados y no como carácter de la fuente a propósito.
 *
 *  Con texto, el ⇄ queda descentrado: su tinta baja un pixel bajo la línea
 *  base y ↑↓ no, así que `items-center` los alinea distinto. Y peor: las
 *  métricas cambian según la fuente, o sea que el ajuste que sirve en Windows
 *  con Segoe falla en el iPhone con SF Pro. En SVG el centro es el centro.
 *
 *  Todo en un viewBox de 16 con la tinta centrada en (8,8).
 */
// los tres ocupan exactamente de 3 a 13 en su eje, así que su centro cae en
// (8,8) igual que el del recuadro. Cambiar un número aquí los descentra.
//
// En la transferencia las puntas miden 1.5 de alto y las líneas van en 4.5 y
// 11.5: así queda un carril libre de 4 unidades entre una flecha y otra. Con
// puntas más grandes se meten en el espacio de la de enfrente y parece que
// una está encima de la otra.
const TRAZOS = {
  ingreso: "M8 13V3M8 3 4.2 6.8M8 3l3.8 3.8",
  egreso: "M8 3v10M8 13 4.2 9.2M8 13l3.8-3.8",
  transferencia:
    "M3.5 4.5h9M12.5 4.5l-2.5-1.5M12.5 4.5l-2.5 1.5" +
    "M12.5 11.5h-9M3.5 11.5l2.5-1.5M3.5 11.5l2.5 1.5",
};

export function IconoTipo({ type, className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={TRAZOS[type] || TRAZOS.egreso} />
    </svg>
  );
}

// mismo color que los botones de la navegación rápida, que se ven mejor que
// el símbolo en tinta neutra
export const COLOR_TIPO = {
  ingreso: "border-ok/30 bg-ok/15 text-ok",
  egreso: "border-err/30 bg-err/15 text-err",
  transferencia: "border-accent/30 bg-accent/15 text-accent",
};

const NOMBRE = {
  ingreso: "Ingreso",
  egreso: "Egreso",
  transferencia: "Transferencia",
};

/** Cuadro redondeado con el tipo de movimiento, en liquid glass. */
export default function TipoBadge({ type, className = "" }) {
  const tipo = COLOR_TIPO[type] ? type : "egreso";
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border backdrop-blur ${COLOR_TIPO[tipo]} ${className}`}
      title={NOMBRE[tipo]}
    >
      <IconoTipo type={tipo} />
    </span>
  );
}
