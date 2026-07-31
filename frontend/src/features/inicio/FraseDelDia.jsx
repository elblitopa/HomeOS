import { useState } from "react";
import { apiPut } from "../../api/client.js";
import GlassCard from "../../components/ui/GlassCard.jsx";

/** La frase del día con su botón de pin.
 *
 *  El pin es solo un marcador: guardar una frase no cambia cuál sale mañana.
 *  Se guarda el TEXTO y no una posición, porque la lista curada crece con
 *  cada versión y un índice apuntaría a otra frase.
 */
export default function FraseDelDia({ frase, fijadas, onFijadasChange }) {
  const [guardando, setGuardando] = useState(false);
  if (!frase) return null;

  const fijada = fijadas.includes(frase);

  const alternar = async () => {
    const nuevas = fijada ? fijadas.filter((f) => f !== frase) : [...fijadas, frase];
    onFijadasChange(nuevas); // respuesta inmediata
    setGuardando(true);
    try {
      await apiPut("/api/settings", { quotes_pinned: nuevas });
    } catch {
      onFijadasChange(fijadas); // si falla, se revierte
    } finally {
      setGuardando(false);
    }
  };

  return (
    <GlassCard className="flex items-start gap-3 p-4">
      <p className="min-w-0 flex-1 text-sm italic text-ink-soft">{frase}</p>
      <button
        onClick={alternar}
        disabled={guardando}
        title={fijada ? "Quitar de las guardadas" : "Guardar esta frase"}
        className={`shrink-0 rounded-lg px-2 py-1 text-sm transition ${
          fijada ? "text-accent" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
        }`}
      >
        {fijada ? "📌" : "📍"}
      </button>
    </GlassCard>
  );
}
