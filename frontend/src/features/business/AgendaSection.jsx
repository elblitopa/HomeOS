import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPut } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import useMediaQuery from "../../hooks/useMediaQuery.js";
import { inputCls } from "../todos/TaskFormModal.jsx";
import AgendaCalendar from "./AgendaCalendar.jsx";
import AgendaCards from "./AgendaCards.jsx";
import AgendaEventModal from "./AgendaEventModal.jsx";
import AgendaTable from "./AgendaTable.jsx";

// el orden y el default cambian por dispositivo: en PC/iPad el calendario es
// lo comodo; en el celular la grilla mensual no luce y las tarjetas si
const ORDEN_ESCRITORIO = [
  { key: "calendario", label: "Calendario" },
  { key: "tarjetas", label: "Tarjetas" },
  { key: "tabla", label: "Tabla" },
];
const ORDEN_MOVIL = [
  { key: "tarjetas", label: "Tarjetas" },
  { key: "calendario", label: "Calendario" },
  { key: "tabla", label: "Tabla" },
];

/** La Agenda del negocio: eventos de clientes en tres vistas.
 *
 *  Las vistas solo pintan; crear/editar y el catálogo de renta viven aquí.
 */
export default function AgendaSection({ contextId }) {
  // md: = iPad en adelante, el mismo corte que usa todo el panel
  const esEscritorio = useMediaQuery("(min-width: 768px)");
  const [eventos, setEventos] = useState([]);
  const [options, setOptions] = useState([]);
  const [modal, setModal] = useState(null); // null | {} | {item}
  const [catalogo, setCatalogo] = useState(false);
  const [nuevaOpcion, setNuevaOpcion] = useState("");

  // la preferencia se guarda por tipo de dispositivo: elegir Tabla en la PC
  // no debe cambiar lo que abre el celular
  const vistaKey = esEscritorio ? "agenda-vista-escritorio" : "agenda-vista-movil";
  const [eleccion, setEleccion] = useState(null);

  const vistas = esEscritorio ? ORDEN_ESCRITORIO : ORDEN_MOVIL;
  const vista = eleccion || localStorage.getItem(vistaKey) || vistas[0].key;

  const cambiarVista = (v) => {
    setEleccion(v);
    localStorage.setItem(vistaKey, v);
  };

  const refresh = useCallback(() => {
    apiGet(`/api/business/events?context_id=${contextId}`).then(setEventos).catch(() => {});
    apiGet(`/api/business/info/${contextId}`)
      .then((info) => setOptions(info.agenda_options || []))
      .catch(() => {});
  }, [contextId]);

  useEffect(refresh, [refresh]);

  const guardarOpciones = async (nuevas) => {
    const previas = options;
    setOptions(nuevas); // respuesta inmediata
    try {
      await apiPut(`/api/business/info/${contextId}`, { agenda_options: nuevas });
    } catch {
      setOptions(previas);
    }
  };

  const agregarOpcion = () => {
    const texto = nuevaOpcion.trim();
    if (!texto || options.includes(texto)) return;
    setNuevaOpcion("");
    guardarOpciones([...options, texto]);
  };

  const onOpen = (item) => setModal({ item });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl bg-ink/5 p-1">
          {vistas.map((v) => (
            <button
              key={v.key}
              onClick={() => cambiarVista(v.key)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                vista === v.key ? "bg-surface shadow-sm" : "text-ink-soft"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setCatalogo(true)}>
            Catálogo
          </Button>
          <Button onClick={() => setModal({})}>＋ Evento</Button>
        </div>
      </div>

      {vista === "tabla" && <AgendaTable items={eventos} onOpen={onOpen} />}
      {vista === "tarjetas" && <AgendaCards items={eventos} onOpen={onOpen} />}
      {vista === "calendario" && <AgendaCalendar items={eventos} onOpen={onOpen} />}

      <AgendaEventModal
        open={!!modal}
        item={modal?.item}
        contextId={contextId}
        options={options}
        onClose={() => setModal(null)}
        onSaved={refresh}
      />

      {/* catálogo de renta: qué se puede rentar en este negocio */}
      <Modal open={catalogo} onClose={() => setCatalogo(false)} title="Catálogo de renta" size="sm">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-ink-soft">
            Las opciones que salen al agendar. Quitar una no borra nada de los
            eventos ya guardados.
          </p>
          <div className="flex flex-col gap-1.5">
            {options.map((o) => (
              <div
                key={o}
                className="flex items-center gap-2 rounded-xl border border-glass-border bg-surface/50 px-3 py-1.5"
              >
                <span className="flex-1 text-sm">{o}</span>
                <button
                  className="text-sm text-ink-soft transition hover:text-err"
                  title="Quitar del catálogo"
                  onClick={() => guardarOpciones(options.filter((x) => x !== o))}
                >
                  ✕
                </button>
              </div>
            ))}
            {options.length === 0 && (
              <p className="text-sm text-ink-soft">Sin opciones. Agrega la primera 👇</p>
            )}
          </div>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={nuevaOpcion}
              onChange={(e) => setNuevaOpcion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregarOpcion()}
              placeholder="Luces láser, Humo…"
            />
            <Button onClick={agregarOpcion} disabled={!nuevaOpcion.trim()}>
              ＋
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
