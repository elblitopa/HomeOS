import { Link } from "react-router-dom";

/** "Buenos días" según la hora. En español de México la tarde se estira
 *  hasta las 8, así que la noche empieza a las 20. */
export function saludoDe(hora) {
  if (hora >= 5 && hora < 12) return "Buenos días";
  if (hora >= 12 && hora < 20) return "Buenas tardes";
  return "Buenas noches";
}

export default function Saludo({ ahora, nombre }) {
  const fecha = ahora.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div>
      {/* first-letter y no capitalize: capitalize pondría mayúscula en cada
          palabra y saldría "Domingo, 26 De Julio" */}
      <p className="text-sm text-ink-soft first-letter:uppercase">{fecha}</p>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {saludoDe(ahora.getHours())}
        {nombre ? `, ${nombre}` : ""}
      </h1>
      {!nombre && (
        <Link to="/ajustes" className="text-sm text-accent hover:underline">
          Ponle tu nombre
        </Link>
      )}
    </div>
  );
}
