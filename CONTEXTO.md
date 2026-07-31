# HomeOS — contexto para retomar

Panel central personal en `0.0.0.0:8777`, accesible desde PC, iPhone y iPad por
Tailscale. FastAPI + SQLite (SQLAlchemy) + React/Vite/Tailwind v4 compilado y
servido estático por FastAPI.

Repo: https://github.com/elblitopa/HomeOS (privado)
Carpeta: `C:\Users\pablo\OneDrive\Documents\Proyectos\HomeOS`

---

## Estado del repo

Todo comiteado. Las nueve tandas que estaban sueltas quedaron en ocho commits
sobre `5c38935`, en el orden que imponen los imports:

| Commit | Qué trae |
|---|---|
| `b000b9b` | Móvil: el fondo de luces se estiraba y se recortaba en iOS |
| `1b1aa56` | Rutinas: acomodar el checklist arrastrando |
| `e02c06d` | Miniaturas de las imágenes subidas |
| `90a1886` | Finanzas: programados, cuenta predeterminada, filtros y PayPal |
| `a343c3c` | Google Calendar: espejo de HomeOS hacia tu cuenta |
| `a2e0f85` | Calendario: detalle de cualquier bloque y mover arrastrando |
| `f563aab` | Inicio: la portada con saludo, frase del día e inbox |

Más el último, que trae el build del frontend: `frontend/dist/` es un solo
bundle y no se puede repartir entre commits sin rebuildear con código a medias.

Programados, cuenta predeterminada, filtros de fecha y PayPal viajan en un solo
commit porque están entretejidos en los mismos archivos (`finance.py`,
`FinanceModals.jsx`, `ResumenTab.jsx`): separarlos habría dejado commits que no
corren.

---

## Secciones

| Sección | Qué tiene |
|---|---|
| **Inicio** (`/`) | Saludo por hora + nombre, frase del día con pin, e inbox con pestañas Hoy / Semana. Es la portada |
| Apps (`/apps`) | Lanza los 5 proyectos, start/stop del .bat, estado por puerto |
| Calendario | Vista Mes y Día. Junta eventos, Google, tareas, suscripciones, pagos, metas, notas, programados y transacciones. Click en cualquier bloque abre su detalle |
| Tareas | Prioridades, contextos, fecha límite, timeline de notas y archivos |
| Finanzas | Resumen, Transacciones, **Programados**, Categorías, Mensual, Presupuesto, Proveedores, Negocios, y Divisas aparte |
| Rutinas | Checklist diario reordenable, matriz semanal, gráfica de 30 días |
| Notas / Archivos / Ajustes | Texto y voz · biblioteca con previews · Google, semana, Discord, contextos, nombre y frases |

---

## Reglas del proyecto que hay que respetar

- **Migraciones a mano.** Columnas nuevas van en la lista `MIGRATIONS` de
  `backend/database.py` (ALTER TABLE). `create_all()` no agrega columnas a
  tablas existentes; sí crea tablas nuevas completas. **Requiere reiniciar.**
- **Reiniciar el servidor** tras cualquier cambio de backend. El frontend solo
  necesita `npm run build` dentro de `frontend/`.
- **Probar sin tocar los datos en uso:** levantar una segunda instancia en el
  puerto 8778 (`venv/Scripts/python.exe -m uvicorn backend.main:app --port 8778`)
  y borrar los datos de prueba al terminar.
- **Móvil:** el documento debe scrollear nativo. Usar `bg-surface`, nunca
  `bg-white`. El contenedor usa `min-h-dvh` y no `min-h-full`: con
  `status-bar-style: black-translucent`, `height:100%` devuelve la pantalla
  menos la barra de estado y todo se recorre ~59 px.
- **Fechas en el frontend:** nunca `toISOString()` para un input local — da UTC
  y adelanta 6 horas. Usar `toInputLocal()` de `lib/constants.js`.
- **Verificación:** el panel del navegador no compone frames, así que no hay
  capturas. Medir con `getComputedStyle`/`getBoundingClientRect`; con elementos
  que tengan `transition` hay que forzar `transition:none` + reflow.
- **Git en PowerShell:** no usar comillas dobles dentro del mensaje de commit.

---

## Decisiones de arquitectura que conviene no deshacer

- **Los programados viven en su propia tabla** (`scheduled_transactions`), no
  como estado dentro de `transactions`. `_account_balances()` suma todas las
  filas sin filtrar, así que un movimiento futuro guardado ahí alteraría el
  saldo desde que se anota. Al concretarse nace la `Transaction` real, igual
  que hacen `/recurring/{id}/pay` y `/subscriptions/{id}/pay`.
- **El detalle del calendario es un endpoint despachador**
  (`GET /api/calendar/item?kind=&ref_id=&date=`), no datos engordados en la
  agenda. La agenda es el camino caliente y se recarga en cada cambio de mes.
  Devuelve una lista de **campos tipados** (`texto|dinero|fecha|progreso|
  multilinea`) ya ordenados, para que el frontend tenga ~5 casos por tipo de
  campo y no 9 por tipo de cosa.
- **La identidad de un bloque del calendario es la tripleta
  `(kind, ref_id, date)`**, no el id: suscripciones y pagos se expanden a
  ocurrencias virtuales que comparten `ref_id`.
- **El detalle y sus acciones viven en un hook compartido**
  (`hooks/useDetalleItem.js` + `features/calendar/DetalleItemHost.jsx`) que usan
  Calendario e Inicio. Las acciones las manda el servidor en `detalle.actions`,
  así que duplicar el código haría que un botón nuevo funcionara en una página
  y en la otra no, en silencio.
- **`tarea` y `google` no pasan por el despachador**: la primera tiene su
  `TaskDetailModal`, el segundo ya viaja completo en la agenda.
- **PayPal no tiene API útil.** La suya (`/v2/pricing/quote-exchange-rates`) es
  para comercios elegibles con OAuth. Y no hace falta: PayPal usa el tipo de
  cambio del mercado con su margen adentro. Medido con dos cargos reales de
  Shopify: **5.38%** (21 jun) y **5.98%** (21 jul), o sea que **varía**. Por eso
  no se estima con un porcentaje: se captura el monto del recibo.

---

## Integraciones

- **Google Calendar** — espejo de una sola vía (HomeOS manda). Un reconciliador
  en `services/google_sync.py` compara lo que debería existir contra la tabla
  puente `google_links` y empareja la diferencia; corre cada minuto en el
  scheduler y al instante al guardar eventos y tareas. Los espejos llevan una
  marca `extendedProperties.private.homeos` y se saltan al leer, si no cada
  cosa aparecería dos veces. Interruptores en Ajustes.
- **Discord** — avisos de eventos, tareas, pagos, suscripciones y programados.
  ⚠️ **El webhook sigue sin configurarse**, así que no llega nada.
- **Miniaturas** — `GET /api/uploads/thumb?path=&w=` genera WebP cacheados
  (96/320/640). Un comprobante de 3.75 MB baja a 2.9 KB. Usa Pillow, ya está
  en `requirements.txt`.

---

## Pendientes y cosas sabidas

- **Webhook de Discord** sin configurar en Ajustes.
- **El chip "Programados" del calendario sale apagado** porque hay filtros
  guardados de antes que no lo incluían. Se prende una vez y se queda.
- **La transacción de un cobro se crea con la fecha de hoy**, no con la fecha
  que vencía. Si se registra tarde, queda tarde.
- **Nadie ha marcado una cuenta como predeterminada** todavía.
- Idea suelta: marcar una suscripción como "esta siempre va por PayPal" para
  que la casilla venga prendida sola en vez de palomearla cada mes.
- Fases futuras que se han mencionado: Notion sync, Matter (luces/enchufes),
  conectar el kanban de contenido con la app calendarizadora de redes.

---

## Diagnóstico

`data/uploads/diag.html` es una página temporal de diagnóstico de viewport
(se abre en `http://<host>:8777/uploads/diag.html`). Se puede borrar.
