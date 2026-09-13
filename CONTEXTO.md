# HomeOS — contexto para retomar

Panel central personal en `0.0.0.0:8777`, accesible desde PC, iPhone y iPad por
Tailscale. FastAPI + SQLite (SQLAlchemy) + React/Vite/Tailwind v4 compilado y
servido estático por FastAPI.

Repo: https://github.com/elblitopa/HomeOS (privado)
Carpeta: `C:\Users\pablo\OneDrive\Documents\Proyectos\HomeOS`

---

## Estado del repo

Todo comiteado por temas; `frontend/dist/` viaja en su propio commit al final
de cada tanda porque es un solo bundle que no se puede repartir. Última tanda:
dashboard de atención (banner de Inicio, bandeja Necesita tu atención +
Suscripciones, y Actividades agregadas en /negocios).

- **Cada tanda TERMINA fusionada a `main` y pusheada a origin.** El flujo es:
  rama → commits → `git checkout main` → `git merge --ff-only <rama>` →
  `git push origin main`. Nunca dejar el trabajo solo en la rama: la app se
  sirve desde esta carpeta según la rama palomeada, y las sesiones nuevas (y
  cualquier cosa que lea GitHub) parten de `main` — trabajo sin fusionar
  "desaparece" para ellas. Así se perdieron de vista los cambios de Finanzas
  el 30 de agosto (quedaron 6 commits varados en
  `feat/finanzas-ajuste-metas-prestamos`; ya se fusionaron).
- **Antes de empezar una tanda nueva**: confirmar que estás parado en `main`
  y que `git branch --no-merged main` no muestra trabajo pendiente de fusionar.
- **Después del push, desplegar en la nube** (la VM no se actualiza sola):
  `ssh pablo_alanis0@homeos-cloud` → `cd /opt/homeos/app && git pull &&
  docker compose build && docker compose up -d` (backup antes:
  `sudo /opt/homeos/app/scripts/backup-homeos.sh`). Detalle en DEPLOYMENT.md
  PARTE 14. Ojo: el Docker compila su propio bundle desde `src/`, así que el
  hash del JS en la nube no coincide con el de `frontend/dist/` — para
  verificar la versión hay que buscar textos de la UI nueva en el bundle, no
  comparar hashes.

---

## Secciones

| Sección | Qué tiene |
|---|---|
| **Inicio** (`/`) | Banner opcional tipo cover, saludo por hora + nombre, frase del día con pin, inbox Hoy / Semana, y columna derecha (desktop) con **Necesita tu atención** y **Suscripciones próximas**. Es la portada |
| Apps (`/apps`) | Lanza los 5 proyectos, start/stop del .bat, estado por puerto |
| Calendario | Vista Mes y Día. Junta eventos, Google, tareas, suscripciones, pagos, metas, notas, programados y transacciones. Click en cualquier bloque abre su detalle |
| Tareas | Prioridades, contextos, fecha límite, timeline de notas y archivos |
| Finanzas | Resumen (con **Próximos movimientos**), Transacciones, **Consumibles**, **Programados**, Metas, Préstamos, Categorías, Mensual, Presupuesto (con **Distribución de ingresos**), y Divisas aparte. Ojo 👁 de **privacidad** en la cabecera y **detalle por cuenta** en `/finanzas/cuentas/:id` |
| **Negocios** (`/negocios`) | Tarjetas con banner, una por negocio, + **Actividades pendientes** (vista agregada de los proyectos de TODOS los negocios: Lista/Calendario y filtro por negocio) → detalle (en tabs o tarjetas con banner por sección) con Proyectos (Tabla/Tablero/Calendario), **Agenda** (eventos de clientes, opcional por negocio), Proveedores, Pagos, CRM, Contenido, Competidores, Mensajes, Documentos y Manual |
| Rutinas | Checklist por día (se puede palomear cualquier fecha pasada), matriz semanal clicable, gráfica de 30 días |
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
- **Un negocio ES un contexto con la palomita `is_business`** (más
  `banner_path` y `sort_order` en `contexts`). Así todo lo que ya se etiqueta
  por contexto pertenece al negocio sin duplicar el concepto. La palomita
  solo decide si sale como tarjeta en `/negocios`; los endpoints no la
  validan. Crear un negocio crea su contexto; se marca/desmarca en Ajustes.
- **Los proyectos de negocio (`business_projects`) van aparte de los Todos**
  a propósito: progreso de 3 estados (`sin_empezar|en_curso|terminado`),
  prioridad P1-P3, área, estrategia y clientes. NO aparecen en el calendario
  general. El kanban del tablero usa eventos de puntero (no DnD de HTML5,
  que iOS ignora) — patrón de `useCardSort` con `[data-col]`.
- **Deudas, suscripciones, programados y transacciones llevan `context_id` y
  `provider_id`**, y los endpoints `/pay` y `/confirm` los propagan a la
  `Transaction` que crean. De eso vive la sección Pagos del negocio (cuánto
  debo a cada proveedor, en MXN vía `pending_amount_mxn`).
- **La Agenda de eventos (`business_events`) es una sección opcional por
  negocio** (`contexts.has_agenda`), no un framework de secciones — decisión
  explícita del usuario, pensada para Renta Bocinas. Reservado = anticipo
  (`deposit`) > 0, derivado en `to_dict`. El catálogo de renta y los banners
  por sección viven en `business_info` (JSON, `agenda_options` con siembra
  virtual: None responde las 5 default sin persistir). El PUT de info es
  parcial (`exclude_unset`): cada sección guarda SOLO lo suyo.
- **Los eventos agendados sí van al calendario general** como kind "agenda"
  (🎉 rosa), con join a `has_agenda == 1`: apagar la palomita los oculta sin
  borrar. Movibles con drag conservando duración. La grilla mensual chica es
  `components/ui/MonthGrid.jsx`, compartida por Proyectos y Agenda (la de
  CalendarPage sigue aparte a propósito: es monolítica).
- **Finance v2 (rama `feature/finance-v2` — SIN fusionar A PROPÓSITO, espera
  aprobación explícita de Pablo; NO aplicar aquí la regla de "fusionar toda
  rama pendiente")**:
  - **Privacidad**: el ojo de Finanzas es una preferencia POR DISPOSITIVO en
    localStorage (`homeos-finanzas-privacidad`), jamás en la base. Una sola
    fuente de verdad: `features/finance/privacidad.jsx` (provider + hook
    `usePrivacidad().money()` que reemplaza a fmtMoney en las vistas). Los
    modales de edición NO se enmascaran a propósito (editar exige ver); las
    Divisas tampoco (tipos de cambio públicos). Es cortina visual, no cifrado.
  - **Detalle de cuenta**: `GET /api/finance/accounts/{id}/detail` con
    `period=hoy|semana|mes|ano|todo|custom` (rangos centralizados en
    `services/periodos.py`, [inicio, fin), semana según week_starts_on).
    Ingresos/egresos/flujo neto EXCLUYEN transferencias (ya son un type
    propio); las transferencias recibidas salen en el historial (mueven
    saldo) convertidas con la misma aritmética que _account_balances.
    Paginación limit/offset + total_count.
  - **MOVIMIENTO REAL vs CONCILIACIÓN** (`transactions.is_adjustment`, en
    MIGRATIONS): un ajuste de "Actualizar saldo/deuda" usa type
    ingreso/egreso SOLO para mover el balance; NO es actividad financiera.
    Regla de oro: BALANCE = reales + conciliaciones (jamás filtrar);
    ACTIVIDAD (ingresos, egresos, flujo, resúmenes, presupuestos, %,
    alertas) = solo reales → toda métrica nueva que agregue montos por type
    DEBE filtrar con `actividad_real()` (models/finance.py, criterio
    central). Los filtros Ingresos/Egresos del historial excluyen ajustes;
    "Todos" los muestra con badge "Ajuste" y monto en neutro. El endpoint
    /adjust marca el flag; nada depende del texto de la descripción. En
    tarjetas, /adjust acepta `current_debt` (deuda en positivo; la
    traducción de signo vive en la API) además de `real_balance` (compat).
  - **Utilización de crédito** (rama `feature/credit-utilization`): la deuda
    de una tarjeta vive como **balance NEGATIVO** (los gastos son egresos que
    restan; pagarla es una transferencia entrante) — deuda = max(0, −balance)
    y saldo a favor = max(0, balance). El modal captura "Saldo adeudado
    inicial" en positivo y mapea el signo (solo UX, el motor no cambia).
    `services/tarjetas.py` centraliza `metricas_credito` (used/available/
    over_limit/%/estado con umbrales 30/50/80/100 en UTILIZACION_NIVELES) y
    `tarjeta_info` arma el `card` completo (fechas + métricas) que viaja en
    /accounts y en el detalle; el frontend solo pinta
    (`CreditoUtilizacion.jsx`, compacto en la tarjeta y completo en el
    detalle). Límite NULL o 0 = "Límite no configurado", sin divisiones ni
    %; el % queda visible con privacidad activa (no revela montos). Cero
    cambios de schema.
  - **Tarjetas de crédito**: `accounts.statement_day/payment_day/credit_limit`
    (MIGRATIONS; NULL en cuentas normales y se limpian si el tipo deja de ser
    credito). TODO se deriva en `services/tarjetas.py`: día inexistente → fin
    de mes (31/feb → 28-29), y el pago pertenece al corte ANTERIOR (corte 15 +
    pago 5 → el corte de sep se paga el 5 de oct). Calendario: kind
    `tarjeta` (expansión virtual, identidad (kind, ref_id, date), color
    #0c8599 — chip nuevo: filtros guardados viejos lo traen apagado). Google:
    entradas `tarjeta_corte`/`tarjeta_pago` por cuenta en el set deseado del
    reconciliador (actualiza por fingerprint, jamás duplica). Discord: avisos
    a 7/3/1/0 días (`AVISOS_DIAS` en tarjetas.py) con dedup en sent_reminders
    (clave con fecha).
  - **Distribución de ingresos**: tablas nuevas `budget_buckets` (name, kind
    max|min, percent, base real|esperado), `budget_bucket_categories` con
    UNIQUE(category_id) y `budget_bucket_accounts` con UNIQUE(account_id) —
    una categoría/cuenta vive en UN solo objetivo para no contar nada dos
    veces. Un bucket mide egresos de sus categorías Y/O transferencias HACIA
    sus cuentas destino (inversión/ahorro): la transferencia banco→GBM cuenta
    como destinado SIN volverse egreso ni tocar ingresos/flujo neto de
    ninguna vista (types disjuntos = imposible doble conteo). Cálculo 100% derivado en
    `services/presupuesto_pct.py`: gasto = egresos MXN de sus categorías del
    periodo; anual = ACUMULADO real del año (no promedio de meses); ingreso
    esperado anual = mensual×12 (aproximación). Umbrales de máximos
    centralizados en THRESHOLDS (75/90/100). Estados max:
    ok|aviso|cerca|al_limite|excedido; min: debajo|cerca|cumplido (semántica
    de progreso, nunca "ya usaste 90%").
  - **Mensajes/alertas**: `services/mensajes_finanzas.py` — frases por reglas
    deterministas, PULL (estado calculado, sin persistencia = sin spam ni
    dedup manual). `GET /api/finance/alerts` alimenta la sección 💰 Finanzas
    de la bandeja de Inicio; `GET /api/finance/upcoming` combina
    corte/pago/suscripciones/deudas/programados para "Próximos movimientos".
    Los push de Discord van aparte en el scheduler con sent_reminders.
  - **Alcance V1 de notificaciones** (decisión explícita): presupuestos →
    SOLO dentro de HomeOS (bandeja de Inicio + pestaña Presupuesto), sin push
    externo. Tarjetas → calendario HomeOS + espejo Google (los eventos de
    Google llevan recordatorio PROPIO: popup a las 9:00 AM del día anterior
    vía AVISO_DIA_ANTERIOR, NO el default del calendario del usuario) +
    Discord si el webhook algún día se configura. No hay sistema push nuevo.
- **Personalización de páginas (estilo Notion: cover + menú ••• +
  tipografía)**, rama `feature/page-personalization`. UNA arquitectura:
  registro central `frontend/src/lib/pages.js` (page_keys estables:
  home, finance, calendar, tasks, businesses, routines, notes, files, apps
  — Ajustes fuera a propósito), espejado en `routers/page_prefs.py`.
  `TopBar` recibe `pageKey` y pinta el cover (`PageBanner`) y el menú
  (`PageMenu`) de `components/layout/PageHeader.jsx`; Inicio, que tiene su
  saludo propio, usa las mismas dos piezas. Persistencia en backend (se
  sincroniza entre dispositivos, a diferencia del ojo de privacidad): tabla
  kv `settings`, JSON por `page_prefs:<key>` {font, banner_position} —
  **sin migración**. El banner de Inicio sigue en su clave legacy
  `home_banner_path` como fuente única; la card "Portada de Inicio" de
  Ajustes se ELIMINÓ (2026-09-13): el ÚNICO punto de entrada para banner y
  tipografía de cualquier página, Inicio incluido, es ••• → Personalizar
  página. Banners = mismo `/api/uploads/banner` y miniatura WebP
  **1280** (variante nueva de `THUMB_SIZES`, mismo cache privado; nunca el
  original). Quitar banner solo suelta la asociación, el archivo se queda.
  Tipografía: clases `.page-font-serif/.page-font-mono` (stacks del
  sistema, sin fuentes descargadas) aplicadas por `PageFontScope` en
  App.jsx SOLO al contenedor de rutas — el sidebar nunca cambia; las
  páginas internas heredan la de su sección por prefijo de ruta.
  `banner_position` ya se guarda (center|top|bottom) para el futuro
  "Reposicionar" sin rehacer nada.
- **El dashboard agrega, nunca duplica (una entidad → muchas vistas).** La
  bandeja **Necesita tu atención** de Inicio y las **Actividades pendientes**
  de /negocios son vistas de registros que ya existían: tareas (`todos`, con
  su prioridad 1-4 y su relación a negocio vía `context_id`) y actividades de
  negocio (`business_projects`, P1-P3 + progreso + fecha). No hay tabla nueva
  ni columna nueva: completar/editar desde cualquier vista actualiza el
  registro original y las demás vistas se recalculan solas.
  - **Ranking de atención** (`rankAtencion` en
    `features/inicio/AtencionSidebar.jsx`): buckets temporales deterministas
    — vencidos (más viejo primero) → vence hoy → 1-3 días → prioridad alta
    restante (con fecha primero, sin fecha al final) → 4-7 días — y la
    prioridad SOLO desempata dentro de cada bucket (P2 vencida gana a P1 en
    20 días). Nada se persiste: se calcula de fecha+prioridad+estado al
    pintar. Tope ~6 en la portada, "Ver todas" → /tareas. Días en calendario
    local (`soloDia`), nunca `toISOString()`.
  - **Suscripciones próximas en Inicio** reusa `urgencia()` exportada de
    `ResumenTab` (≤0 rojo, ≤7 ámbar) y el mismo texto de días que Finanzas:
    una sola definición de urgencia. Suscripciones NO entran a la bandeja de
    atención (no son accionables como tarea, evita duplicados visuales).
  - **Actividades de /negocios** = `GET /api/business/projects` sin
    `context_id` (ahora opcional). Lista (tabla en desktop, cards en móvil,
    terminadas fuera) + Calendario (el `MonthGrid` compartido, chips del
    color del negocio) + filtro por negocio. Edita con el MISMO
    `ProjectFormModal` (ahora exportado; con la prop `negocios` deja mover
    la actividad de negocio con un select — mismo id, solo cambia
    `context_id`).
  - **Banner de Inicio**: clave `home_banner_path` en la tabla `settings`
    (kv, sin migración), imagen por `/api/uploads/banner` como los banners
    de negocios; se gestiona SOLO desde ••• → Personalizar página (la card
    de Ajustes ya no existe). En Inicio se pinta la miniatura WebP 1280 vía
    `PageBanner`; sin banner no se reserva espacio. Los banners de negocio ya existían (modal de editar
    negocio + `contexts.banner_path`).
  - Los datos de Inicio viven en `useInbox` (un fetch por fuente, sin
    duplicar el de tareas); Inicio pasa los crudos a `AtencionSidebar`.
- **Consumibles = tracking estadístico sobre egresos reales, sin segunda
  copia.** La tabla `consumables` solo guarda identidad (`id`, `name`,
  `active`, `created_at`); qué compras le pertenecen lo dice
  `transactions.consumable_id` (FK `ON DELETE SET NULL`, agregada en
  `MIGRATIONS`). NADA calculado se persiste: `GET /api/finance/consumables`
  deriva todo de la historia real — compras = egresos con ese
  `consumable_id` ordenados por `occurred_at`; frecuencia = promedio
  aritmético de los días entre compras consecutivas (redondeado a días
  enteros, calculado sobre `.date()` para que la hora no meta fracciones);
  próxima estimada = última compra + promedio. Con menos de 2 compras no hay
  promedio ni próxima ("Esperando la segunda compra"). Editar la fecha o
  borrar una compra recalcula solo, y borrar la última compra NO borra el
  consumible.
  - **Alta atómica**: la primera compra se registra con
    `new_consumable_name` en el payload de `POST/PUT /transactions` — NO es
    columna del modelo; el router lo resuelve a `consumable_id` con `flush()`
    en la misma sesión (un solo commit, sin huérfanos). La recompra manda
    `consumable_id`. Ambos a la vez es 400; en ingresos, transferencias o
    programados también es 400 (los programados ni traen esos campos: un
    plan no es una compra). El modal limpia la selección al cambiar de tipo.
  - **Duplicados**: mismo nombre ignorando mayúsculas/espacios reutiliza el
    artículo existente (y lo revive si estaba archivado) en vez de duplicar;
    renombrar hacia un nombre ocupado da 409.
  - **Archivar** (`PUT /consumables/{id}` con `active=false`) solo lo saca
    del selector de recompras y de la lista por defecto
    (`?include_archived=true` lo trae); jamás toca transacciones. No hay
    DELETE a propósito: la historia financiera no se borra desde aquí.
  - No confundir con Programados: programado = sé que habrá un movimiento
    futuro; consumible = HomeOS observa cuándo compro y estima cuándo
    volveré a necesitarlo. La predicción es estadística, no crea
    transacciones futuras ni alertas duras.
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

## Fase futura: HomeOS AI Assistant (SOLO documentada, NO implementada)

Un asistente que interprete lenguaje natural e imágenes y proponga acciones
sobre los datos de HomeOS. Casos previstos:

- **Foto de ticket** → extraer establecimiento, fecha, total, posible
  categoría y cuenta si se deduce; mostrar PREVIEW ("Gasto $842.50 · HEB ·
  Supermercado · 12 sep") y preguntar "¿Registrar?". Nunca guardar solo.
- **Crear nota** desde ideas dictadas → preview → confirmar → nota.
- **Rutinas**: "hoy ya hice gimnasio y lectura" → identifica rutinas
  existentes → preview ✓ Gimnasio ✓ Lectura → confirmar → completar.
- **Tareas**: "ya terminé pagar la luz" → busca el pendiente → preview
  "Marcar como completada: Pagar luz" → confirmar.
- **Finanzas**: "hoy gasté 350 pesos en gasolina con BBVA" → egreso, 350,
  categoría Transporte, cuenta BBVA → preview → confirmar → registrar.

**Arquitectura obligatoria**: el modelo JAMÁS toca SQLite ni ejecuta SQL o
comandos. Flujo: usuario → intérprete de IA → acción ESTRUCTURADA (p. ej.
`{action: "create_transaction", data: {amount, type, category, account_id}}`)
→ preview → confirmación → **la API existente de HomeOS** valida y ejecuta →
DB. Toda operación que modifique datos requiere confirmación en V1. Nada de
esto existe todavía en el código.

## Pendientes y cosas sabidas

- **Webhook de Discord** sin configurar en Ajustes.
- **El chip "Programados" del calendario sale apagado** porque hay filtros
  guardados de antes que no lo incluían. Se prende una vez y se queda.
- **La transacción de un cobro se crea con la fecha de hoy**, no con la fecha
  que vencía. Si se registra tarde, queda tarde.
- **Nadie ha marcado una cuenta como predeterminada** todavía.
- **Solo "Renta Bocinas" está marcado como negocio** (con Agenda prendida);
  Perfumes/ShopifyBot siguen sin palomear en Ajustes (sus datos aparecen
  solos al marcar). "Ideas" puede seguir de contexto normal o borrarse.
- ⚠️ **El nombre "Renta Bocinas" es una reconstrucción**: un PUT de prueba
  renombró por accidente el negocio que el usuario creó el 2 de agosto (id 5,
  estaba vacío). Si se llamaba distinto o tenía otro color, corregirlo en
  el modal de editar.
- **El chip "Agenda" del calendario** puede salir apagado por filtros
  guardados viejos; se prende una vez y se queda (igual que pasó con
  "Programados").
- **Las deudas viejas no tienen negocio ni proveedor**: se les asigna
  editándolas en Finanzas (selects nuevos del modal).
- Idea suelta: marcar una suscripción como "esta siempre va por PayPal" para
  que la casilla venga prendida sola en vez de palomearla cada mes.
- Fases futuras que se han mencionado: Notion sync, Matter (luces/enchufes),
  conectar el kanban de contenido con la app calendarizadora de redes.

---

## Diagnóstico

`data/uploads/diag.html` es una página temporal de diagnóstico de viewport
(se abre en `http://<host>:8777/uploads/diag.html`). Se puede borrar.
