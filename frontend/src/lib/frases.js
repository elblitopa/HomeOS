/** Frases de la portada.
 *
 *  Viven en el código y no en un servicio de internet: el panel tiene que
 *  funcionar sin conexión, y casi todo lo bueno de las APIs de frases está
 *  en inglés. El usuario puede agregar las suyas desde Ajustes; se juntan
 *  con estas en un solo pozo.
 */
export const FRASES = [
  "Hoy solo tienes que hacer lo siguiente. Después, lo siguiente.",
  "La disciplina es elegir lo que quieres a largo plazo por encima de lo que quieres ahora.",
  "Lo que no se agenda, no se hace.",
  "Un día ordinario bien hecho vale más que un plan perfecto.",
  "Empieza por lo que te incomoda; el resto sale solo.",
  "No busques motivación, busca el siguiente paso concreto.",
  "Terminar algo mediocre supera a no terminar nada.",
  "El progreso rara vez se siente; se mide.",
  "Cuida los sistemas y los resultados se cuidan solos.",
  "Puedes hacerlo todo, pero no al mismo tiempo.",
  "Lo urgente grita y lo importante espera. Atiende lo importante.",
  "Cada cosa que dejas a medias sigue ocupando espacio.",
  "Decidir es renunciar. Renuncia rápido.",
  "Lo que repites es lo que eres.",
  "Nadie se arrepiente de haber empezado temprano.",
  "Hazlo mal, pero hazlo. Después lo arreglas.",
  "El plan importa menos que la costumbre de revisarlo.",
  "Guardar todo en la cabeza es la forma más cara de olvidar.",
  "Dos horas de trabajo sin interrupciones valen por un día entero picado.",
  "El dinero que no cuentas es el que se va.",
];

/** Día absoluto desde 1970, calculado con los componentes LOCALES.
 *
 *  Se usa Date.UTC sobre año/mes/día locales a propósito: así no hay días de
 *  23 ni de 25 horas cuando entra el horario de verano, y el floor nunca
 *  duplica ni salta un día. */
export function diaAbsoluto(d = new Date()) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// PRNG diminuto y determinista: la misma semilla da siempre la misma serie
function mulberry32(semilla) {
  return function () {
    semilla |= 0;
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function barajar(lista, semilla) {
  const out = [...lista];
  const rnd = mulberry32(semilla);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** La frase de hoy, igual todo el día y en todos los dispositivos.
 *
 *  No se usa `día % n` a secas: con eso se vería el mismo ciclo fijo una y
 *  otra vez, y agregar una frase correría todas de lugar. Barajando por
 *  ciclo, cada vuelta al pozo sale en otro orden y ninguna se repite hasta
 *  que se acaban las demás.
 */
export function fraseDelDia(pool, dia = diaAbsoluto()) {
  if (!pool || pool.length === 0) return null; // sin esto, % 0 daría NaN
  const ciclo = Math.floor(dia / pool.length);
  return barajar(pool, ciclo)[dia % pool.length];
}

/** Las curadas más las del usuario, sin repetir. */
export function pozoDeFrases(propias = []) {
  const vistas = new Set();
  const pozo = [];
  for (const f of [...FRASES, ...propias]) {
    const texto = (f || "").trim();
    if (texto && !vistas.has(texto)) {
      vistas.add(texto);
      pozo.push(texto);
    }
  }
  return pozo;
}
