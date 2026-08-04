import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api/client.js";
import { COLORES_BASE } from "../lib/calendarKinds.js";

/** Toda la máquina del detalle de un elemento: abrirlo, pedir sus datos y
 *  resolver sus acciones.
 *
 *  Vive en un hook y no copiado en cada página a propósito: las acciones que
 *  se ofrecen las manda el servidor en `detalle.actions`, así que el día que
 *  se agregue una acción nueva debe funcionar en todas partes sin tocar nada.
 *  Con copias, el botón aparecería en todos lados y funcionaría en uno solo.
 *
 *  El formulario de eventos se queda FUERA a propósito: el calendario ya lo
 *  usa para dar de alta desde una celda vacía, y si el hook fuera su dueño
 *  acabaría habiendo dos instancias. Por eso `onEditarEvento` es un callback:
 *  el hook arma el payload (incluido el mapeo de un evento de Google, que es
 *  la parte fiddly) y quien lo consume decide qué formulario abrir.
 *
 *  @param onRefresh      se llama después de cada acción que muta datos
 *  @param onEditarEvento (payload) => void. Si no viene, "Editar" navega al calendario
 *  @param contextsById   mapa {id: contexto}. Ojo: mapa, no arreglo
 *  @param colors         colores por tipo. Si no viene, el hook los pide solo
 */
export default function useDetalleItem({
  onRefresh,
  onEditarEvento,
  contextsById = {},
  colors: colorsProp,
} = {}) {
  const [detalleItem, setDetalleItem] = useState(null);
  const [tareaId, setTareaId] = useState(null);
  const [accionFinanzas, setAccionFinanzas] = useState(null);
  const [catalogos, setCatalogos] = useState(null);
  const [error, setError] = useState(null);
  const [coloresPropios, setColoresPropios] = useState(COLORES_BASE);

  const navigate = useNavigate();
  // en un ref y no en dependencias: el refresh del calendario cambia de
  // identidad en cada navegación de mes, y en un array de deps recrearía
  // los callbacks sin parar
  const refRefresh = useRef(onRefresh);
  useEffect(() => {
    refRefresh.current = onRefresh;
  }, [onRefresh]);

  // solo se piden si quien consume no los trae ya cargados
  const pideColores = colorsProp == null;
  useEffect(() => {
    if (!pideColores) return;
    apiGet("/api/settings")
      .then((s) => {
        if (s.calendar_colors) setColoresPropios({ ...COLORES_BASE, ...s.calendar_colors });
      })
      .catch(() => {});
  }, [pideColores]);

  const colors = colorsProp || coloresPropios;
  const colorDe = useCallback(
    (item) => colors[item.kind] || COLORES_BASE[item.kind] || "#2383e2",
    [colors]
  );

  /** Cualquier elemento abre su detalle. Las tareas delegan en su propio
   *  modal, que ya trae línea de tiempo, adjuntos y completar. */
  const abrir = useCallback((item) => {
    setError(null);
    if (item.kind === "tarea") {
      setTareaId(item.ref_id);
      return;
    }
    setDetalleItem(item);
  }, []);

  const cerrar = useCallback(() => {
    setDetalleItem(null);
    setTareaId(null);
    setAccionFinanzas(null);
  }, []);

  const cargarCatalogos = useCallback(async () => {
    if (catalogos) return catalogos;
    const [accounts, categories, goals, rates] = await Promise.all([
      apiGet("/api/finance/accounts"),
      apiGet("/api/finance/categories"),
      apiGet("/api/finance/goals"),
      apiGet("/api/finance/rates"),
    ]);
    const cat = { accounts, categories, goals, rates };
    setCatalogos(cat);
    return cat;
  }, [catalogos]);

  const trasActuar = useCallback(() => {
    setAccionFinanzas(null);
    setDetalleItem(null);
    refRefresh.current?.();
  }, []);

  const payloadDeGoogle = (item) => ({
    id: item.ref_id,
    title: item.title,
    description: item.detail || "",
    start: item.date,
    end: item.end,
    all_day: item.all_day,
    source: "google",
    calendar_id: item.calendar_id,
    calendar_name: item.calendar_name,
  });

  /** El detalle se cierra antes de abrir el modal que corresponda, para que
   *  no queden dos ventanas encimadas. */
  const accionDetalle = useCallback(
    async (id, detalle, item) => {
      if (id === "abrir_google") {
        if (item.link) window.open(item.link, "_blank", "noreferrer");
        return;
      }
      if (id === "editar" && (item.kind === "google" || item.kind === "evento")) {
        const payload =
          item.kind === "google"
            ? payloadDeGoogle(item)
            : { ...(detalle?.data || {}), source: "homeos" };
        setDetalleItem(null);
        // sin formulario propio (por ejemplo desde Inicio), se edita allá
        if (onEditarEvento) onEditarEvento(payload);
        else navigate("/calendario");
        return;
      }
      if (id === "ver_en_finanzas") return navigate("/finanzas");
      if (id === "ver_en_notas") return navigate("/notas");
      // explicito ANTES del fallthrough de abajo: una accion desconocida
      // acaba en el modal de finanzas, que aqui no pinta nada
      if (id === "ver_en_negocio") {
        const ctx = detalle?.context_id ?? item.context_id;
        return navigate(ctx ? `/negocios/${ctx}` : "/negocios");
      }

      // acciones directas, sin formulario de por medio
      if (id === "cancelar") {
        if (!confirm(`¿Marcar "${item.title}" como no concretado?\n\nSe queda en el historial.`))
          return;
        await apiPost(`/api/finance/scheduled/${item.ref_id}/cancel`);
        return trasActuar();
      }
      // cobrar abre modal porque, si el cargo viene en otra divisa, hay que
      // poder capturar lo que de verdad cobraron (PayPal no usa el mercado)
      if (id === "cobrar") {
        try {
          await cargarCatalogos();
        } catch (e) {
          setError(`No se pudieron cargar los datos de finanzas: ${e.message}`);
          return;
        }
        setDetalleItem(null);
        setAccionFinanzas({ id, detalle, item });
        return;
      }

      // editar y concretar necesitan los catálogos (cuentas y divisas para
      // saber si hay conversión de por medio); si no cargan hay que decirlo
      // en vez de dejar el botón muerto
      if (id === "editar" || id === "concretar") {
        try {
          await cargarCatalogos();
        } catch (e) {
          setError(`No se pudieron cargar los datos de finanzas: ${e.message}`);
          return;
        }
      }
      setDetalleItem(null);
      setAccionFinanzas({ id, detalle, item });
    },
    [cargarCatalogos, navigate, onEditarEvento, trasActuar]
  );

  return {
    abrir,
    cerrar,
    colorDe,
    abierto: !!detalleItem || !!tareaId || !!accionFinanzas,
    hostProps: {
      detalleItem,
      tareaId,
      accionFinanzas,
      catalogos,
      contextsById,
      colorDe,
      error,
      onCerrarDetalle: () => setDetalleItem(null),
      onCerrarTarea: () => setTareaId(null),
      onCerrarAccion: () => setAccionFinanzas(null),
      onAccion: accionDetalle,
      onCambio: () => refRefresh.current?.(),
      trasActuar,
    },
  };
}
