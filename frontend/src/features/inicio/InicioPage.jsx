import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "../../api/client.js";
import useContexts from "../../hooks/useContexts.js";
import useDetalleItem from "../../hooks/useDetalleItem.js";
import { COLORES_BASE } from "../../lib/calendarKinds.js";
import { diaAbsoluto, fraseDelDia, pozoDeFrases } from "../../lib/frases.js";
import DetalleItemHost from "../calendar/DetalleItemHost.jsx";
import FraseDelDia from "./FraseDelDia.jsx";
import InboxStack from "./InboxStack.jsx";
import Saludo from "./Saludo.jsx";
import useInbox from "./useInbox.js";

// el nombre se espeja aquí para que el saludo no parpadee en el primer
// pintado mientras llega la respuesta del servidor
const NOMBRE_CACHE = "homeos-nombre";

export default function InicioPage() {
  const { byId } = useContexts();
  const [nombre, setNombre] = useState(() => localStorage.getItem(NOMBRE_CACHE) || "");
  const [propias, setPropias] = useState([]);
  const [fijadas, setFijadas] = useState([]);
  // se aprovecha la misma respuesta de ajustes para los colores del detalle,
  // y así el hook no tiene que pedirlos por su cuenta
  const [colores, setColores] = useState(null);
  // el panel puede quedarse abierto cruzando la medianoche: de este reloj
  // dependen tanto el saludo como la frase, para que las dos cambien juntas
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    apiGet("/api/settings")
      .then((s) => {
        setNombre(s.user_name || "");
        localStorage.setItem(NOMBRE_CACHE, s.user_name || "");
        setPropias(s.quotes_custom || []);
        setFijadas(s.quotes_pinned || []);
        setColores({ ...COLORES_BASE, ...(s.calendar_colors || {}) });
      })
      .catch(() => setColores(COLORES_BASE));
  }, []);

  const frase = useMemo(
    () => fraseDelDia(pozoDeFrases(propias), diaAbsoluto(ahora)),
    [propias, ahora]
  );

  const inbox = useInbox();
  const recargar = useCallback(() => inbox.refresh(), [inbox]);
  const detalle = useDetalleItem({
    onRefresh: recargar,
    contextsById: byId,
    colors: colores || COLORES_BASE,
  });

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <Saludo ahora={ahora} nombre={nombre} />

        <FraseDelDia frase={frase} fijadas={fijadas} onFijadasChange={setFijadas} />

        <InboxStack
          grupos={inbox.grupos}
          rutinas={inbox.rutinas}
          cargando={inbox.cargando}
          completo={inbox.completo}
          contextsById={byId}
          colorDe={detalle.colorDe}
          onAbrir={detalle.abrir}
          onRutinaCambiada={inbox.refresh}
        />
      </div>

      <DetalleItemHost {...detalle.hostProps} />
    </div>
  );
}
