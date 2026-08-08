# HomeOS Cloud — Plan de migración

## Qué vamos a lograr

HomeOS pasa de correr en la PC (accesible solo por Tailscale con la PC prendida) a
correr **24/7 en una VM gratuita de Google**, accesible desde el iPhone con HTTPS y
una clave de acceso. La PC se convierte en un **satélite opcional**: si está
encendida, puedes lanzar y parar tus apps locales desde el panel; si está apagada,
todo lo demás (calendario, finanzas, negocios, agenda, tareas, notas, rutinas,
archivos) sigue funcionando y la sección Apps muestra "PC Principal 🔴 Desconectada".

Principio rector: **un solo servicio, cero reescritura del frontend, y el modo
local actual sigue funcionando idéntico — sin siquiera un `.env`**.

```
                         HOMEOS CLOUD (VM e2-micro, Linux)
                         FastAPI ── frontend estático ── /uploads (disco 30GB)
                         SQLite (o Postgres/Supabase) ── scheduler 24/7
                              ▲ HTTPS (tailscale serve / ts.net)
              ┌───────────────┴────────────────┐
         iPhone / PWA                    PC Windows (opcional)
         (en la Tailnet)                 HomeOS Agent ── .bat / procesos / puertos
                                         (poll + heartbeat por la Tailnet)
```

---

## 1. Arquitectura actual (análisis del repo)

- **Monolito FastAPI** (`backend/main.py`): sirve el frontend compilado
  (`frontend/dist`, SPA fallback), 14 routers bajo `/api/*`, mount `/uploads`,
  y un **scheduler asyncio único** (recordatorios de Discord cada 60s, tipos de
  cambio auto-limitado a 12h, espejo de Google Calendar cada 60s). **Sin CORS y
  sin autenticación** — hoy protege Tailscale/LAN. El bootstrap corre a nivel de
  módulo (create_all, migraciones, import de manifiestos de Apps, seeds).
- **SQLite hardcodeado** (`backend/database.py:11-14`, con `check_same_thread`),
  PRAGMAs vía listener en cada conexión (`journal_mode=DELETE` porque el repo
  vive en OneDrive + `foreign_keys=ON`), y migraciones caseras: lista
  `MIGRATIONS` de 30 tuplas aplicadas por `ensure_columns()` con
  `PRAGMA table_info` (SQLite-only).
- **Secretos**: TODOS viven en la tabla `settings` de la base (client_id/secret y
  tokens de Google en texto plano, webhook de Discord). Nada en variables de
  entorno, nada en git (`data/` está en `.gitignore`). La `REDIRECT_URI` de
  Google está hardcodeada a `http://localhost:8777/...`
  (`backend/services/google_calendar.py:29`).
- **Frontend**: URLs 100% relativas (`frontend/src/api/client.js` no tiene BASE);
  194 llamadas `/api` en 45 archivos y ~30 sitios que pintan `/uploads/...` como
  `<img>`/`<a>`/`backgroundImage`. PWA instalable en iOS (manifest y meta tags
  correctos) pero **sin service worker** (sin soporte offline). Tres fetches
  fuera del client: `usePing.js`, `miniatura()` (como `src` de imagen) y el href
  de `export.xlsx`.
- **Datos**: `data/` pesa ~57 MB (homeos.db ~164 KB + uploads). Fuera de git.

## 2. Dependencias de Windows encontradas

La superficie Windows real es **chica y concentrada**:

| Dónde | Qué | Destino |
|---|---|---|
| `backend/services/process_manager.py` (65 líneas — el ÚNICO archivo Windows-only) | `Popen(["cmd.exe","/c",bat], CREATE_NEW_CONSOLE)`, `taskkill /PID /T /F`, psutil (`pid_alive`, `net_connections`) | Se muda al **Windows Agent** casi tal cual |
| `backend/routers/apps.py` | `_validate_paths` contra el disco local; `POST /api/apps/browse` (explorador server-side SIN restricción — riesgo serio si se expone); start/stop que llaman process_manager; status por `ports.check_port(127.0.0.1)` (en cloud pingearía su propio loopback); `run_manifest_import` lee `Apps/*.json` con rutas Windows absolutas | Modo dual: local = como hoy; cloud = cola de comandos al Agent |
| Frontend: `useAppPings.js:13` y `AppCard.jsx:76` | `http://${window.location.hostname}:${port}` — asume que las apps corren en el mismo host que HomeOS (diseño Tailscale) | En cloud usarán el `agent_host` que reporta el Agent (F4) |
| `HomeOS.bat`, `build.bat`, `install_autostart.bat` | Arranque/instalación Windows (schtasks) | Se quedan para el modo local |

Portabilidad restante (no-Windows pero no-Linux-ready):
- `func.strftime` SQL en `backend/routers/finance.py:1132,1140` (SQLite-only).
- Datetimes naive con `datetime.now()` en todo el backend → en un servidor UTC
  los recordatorios se correrían 6-7 horas. Solución: `TZ=America/Mexico_City`
  en la VM (una línea; el refactor a datetimes con zona queda fuera de alcance).
- `socket.gethostname()` en `/api/system/info` (cosmético).

**Verificado que NO existe**: `os.startfile`, `shell=True`, `winreg`, `ctypes`,
`win32*`, `cp1252`. Todo el HTTP saliente es `urllib` de stdlib; Excel es
openpyxl en memoria; miniaturas con Pillow — todo portable a Linux sin cambios.

**Migra a cloud sin tocar una línea**: finanzas, calendario + espejo Google,
negocios + agenda de eventos, tareas, notas, rutinas, archivos/uploads,
ajustes, scheduler, Discord, tipos de cambio.

## 3. Plataforma y COSTO REAL

| Criterio | **GCE e2-micro (elegida)** | Render | Cloud Run |
|---|---|---|---|
| Costo base | $0 Always Free (us-west1/us-central1/us-east1; e2-micro, 30 GB-mes de disco estándar, 1 GB egress/mes a Norteamérica) | Free se duerme (mata el scheduler) → $7/mes + disco de pago | Pago por uso; `min-instances` cuesta |
| ⚠️ IPv4 externa | **NO es automáticamente $0**: una IPv4 externa en uso puede generar cargo por hora (~$3-4/mes según la tarifa vigente). Verificar la exención del free tier al momento del deploy | Incluida | Incluida |
| Scheduler 24/7 | ✅ proceso siempre vivo | Solo de pago | ❌ scale-to-zero lo mata |
| Disco (SQLite + 57 MB de uploads) | ✅ persistente nativo | De pago | ❌ efímero → obliga a Storage externo |
| Administración | Tú (updates, systemd/compose) | Cero | Cero |

### Estrategia de acceso: Tailscale-first (sin exposición pública)

Ya usas Tailscale en iPhone y PC. La VM se une a la Tailnet y HomeOS queda
accesible **solo dentro de ella**:

- **iPhone → Cloud**: `https://homeos.<tailnet>.ts.net` vía **`tailscale serve`**
  — certificado HTTPS válido y automático de ts.net, así que la cookie `Secure`,
  la PWA instalable y `getUserMedia` (notas de voz) funcionan. Sin Caddy, sin
  dominio propio, sin ningún puerto abierto al mundo.
- **Agent (PC) → Cloud**: por la misma Tailnet.
- **Beneficios**: cero superficie pública (la auth de F1 se queda como defensa en
  profundidad, pero un escáner de internet ni siquiera ve el puerto), sin reglas
  de firewall GCP abiertas, y "Abrir panel" de Apps sigue funcionando igual que
  hoy (todo dentro de la Tailnet).
- **Tradeoffs**: (a) todo dispositivo que use HomeOS necesita Tailscale (hoy ya
  es así); (b) sin acceso desde dispositivos ajenos a la Tailnet (aceptable:
  panel personal); (c) el callback de Google OAuth usaría
  `https://homeos.<tailnet>.ts.net/api/google/callback` — Google solo redirige
  al NAVEGADOR (que está en la Tailnet); sus servidores no necesitan alcanzar la
  VM. Verificar al configurar que Google Cloud Console acepte el dominio ts.net
  como redirect URI (es DNS público real); si lo rechazara, plan B: Cloudflare
  Tunnel solo para esa ruta, o pegar el código manualmente.

### El punto fino: egress de la VM

La VM necesita SALIR a internet (APIs de Google, Discord, tipos de cambio). Sin
ninguna IP externa no hay salida IPv4 (Cloud NAT cuesta). Sub-opciones — la
decisión se toma en F6 con los precios vigentes:

1. **IPv4 externa efímera** si resulta exenta en Always Free → lo más simple.
2. Si cobra: **IPv6 externa (gratis) sin IPv4** — Tailscale funciona sobre IPv6
   y la mayoría de las APIs usadas (Google, Discord, CoinGecko, las de fx tras
   Cloudflare) tienen IPv6. Riesgo: algún endpoint IPv4-only quedaría
   inalcanzable (probar los 4 de `fx.py` antes de decidir). Intento de $0 real.
3. Fallback consciente: pagar la IPv4 (~$3-4/mes) como único costo del stack.

### Supabase

Rol: **Postgres 500 MB free** (opcional, F5) y Storage 1 GB (futuro, no
necesario con el disco de 30 GB). ⚠️ El free tier **pausa el proyecto tras 7
días sin actividad** — con uso diario no pasa, pero hay que saberlo.

Riesgos e2-micro: 1 GB RAM (uvicorn con 1 worker, suficiente para un usuario),
CPU en ráfagas, y el riesgo bajo de que Google cambie Always Free — el
Dockerfile hace la app portable a cualquier VPS en minutos. El egress de 1
GB/mes sobra para uso personal (las imágenes viajan como miniaturas WebP), y con
Tailscale el tráfico usuario↔VM suele ir directo cifrado; el excedente cuesta
centavos, no es un acantilado.

## 4. Autenticación: clave única + cookie de sesión

### Secretos independientes y dónde vive cada uno

| Secreto | Dónde vive | Para qué |
|---|---|---|
| `HOMEOS_ACCESS_KEY` | `.env` de la VM | La clave que tecleas en el login |
| `HOMEOS_SESSION_SECRET` | `.env` de la VM | HMAC aleatorio ≥32 bytes que firma las cookies; rotarlo desloguea sin cambiar la clave |
| `HOMEOS_AGENT_TOKEN` | **`.env` del Agent en la PC** (el servidor guarda solo su hash en la DB) | Identifica al Windows Agent |

Nunca se deriva uno de otro. El token del agente **no** es variable de entorno
del servidor (ver §5, ciclo de vida).

### Un solo selector de entorno: `HOMEOS_ENV`

`HOMEOS_ENV = local | cloud`, default **`local`** sin `.env`. **Todo el
comportamiento deriva de este único selector** (no existen otros flags de modo):

- **`local` (default)** — auth DESACTIVADA: `http://localhost:8777` y el acceso
  por Tailscale-LAN siguen exactamente como hoy; cookie sin `Secure` (HTTP local
  funciona); SQLite default; `process_manager` de Windows directo, como
  actualmente. Cero fricción de desarrollo.
- **`cloud`** — auth OBLIGATORIA; cookie con `Secure` (HTTPS obligatorio);
  command queue / Windows Agent (nunca process_manager local); backend portable
  Linux; y **el backend SE NIEGA A ARRANCAR si falta `HOMEOS_ACCESS_KEY` o
  `HOMEOS_SESSION_SECRET`** — error claro al inicio, nunca quedar expuesto por
  accidente.

### Mecánica

- `POST /api/auth/login` valida la clave con **comparación en tiempo constante**
  (`secrets.compare_digest`) y emite cookie **HttpOnly + SameSite=Lax**, larga
  vida (90 días, por la PWA de iOS), **firmada con `HOMEOS_SESSION_SECRET`**
  (HMAC-SHA256) — sobrevive reinicios y deploys sin tabla de sesiones.
  **Rate limit** en el login (5 intentos/minuto por IP → 429): con
  Tailscale-first es cinturón y tirantes, pero queda listo si algún día se
  expone.
- **Por qué cookie y no header**: los `<img src="/uploads/...">` (~30 sitios),
  el `<a href>` de export.xlsx y `miniatura()` no pueden mandar headers; la
  cookie viaja sola en mismo origen. Cero cambios en `client.js` ni en los 194
  call-sites. HttpOnly además protege la clave de XSS.
- Middleware protege `/api/*` y `/uploads/*` en modo cloud. Exclusiones MÍNIMAS:
  `/api/auth/login`, `/api/system/ping` (health/latencia, no revela nada),
  `/api/agent-bridge/*` (máquina-a-máquina con su propio token, §5),
  `/api/google/callback` (ver nota), y el SPA (`/`, `/assets`, manifest,
  iconos) para poder mostrar el login. **Nada más.**
- **Nota OAuth**: el callback de Google queda fuera del middleware de cookie
  porque llega redirigido desde Google, pero NO es un bypass: exige y consume un
  **`state` de un solo uso** generado al iniciar el flujo; sin state válido →
  403. El callback solo canjea tokens de Google, no expone datos de HomeOS.
- Health check: se reutiliza `GET /api/system/ping` (ya existe y el frontend ya
  lo consume). No se duplica con un `/api/health` nuevo.

## 5. La PC como satélite: Windows Agent

### Tablas nuevas

- `agents`: `device_id` (PK, ej. "pc-principal"), `name`, `platform`,
  `agent_host` (hostname de Tailscale reportado), `token_hash`, `version`,
  `last_seen`. Online = `last_seen` hace menos de 90s.
- `agent_commands`: `id`, `device_id`, `type` (enum CERRADO:
  `START_APP | STOP_APP | GET_STATUS | BROWSE_FOLDERS`), `payload` JSON,
  `status` (`pending | running | done | error | expired`), `result` JSON,
  timestamps. **TTLs**: `pending` >60s → `expired` (nada de apps lanzándose 10
  minutos tarde); `running` >120s → `error` por timeout; el agente al reiniciar
  descarta los `running` huérfanos.

### Dos namespaces con auth SEPARADA (nunca se mezclan)

- **`/api/agent-bridge/*`** — SOLO máquina-a-máquina, autenticado con
  `X-HomeOS-Agent-Token` (tiempo constante contra el hash en DB). Es lo ÚNICO
  excluido del middleware de cookie:
  - `POST /api/agent-bridge/heartbeat` (cada ~15s: device_id, agent_host, y el
    **estado de las apps** — puertos abiertos y pids vivos; la UI de Apps se
    alimenta de esto, no de pings del navegador),
  - `GET /api/agent-bridge/commands?wait=25` (**long-poll desde el inicio** —
    el browse interactivo lo necesita),
  - `POST /api/agent-bridge/commands/{id}/result`.
- **`/api/agents/*`** — endpoints de USUARIO, protegidos por cookie como todo lo
  demás: `GET /api/agents` (estado PC 🟢/🔴), `GET /api/agents/commands/{id}`
  (estado de un comando), y la generación del token del agente desde Ajustes.

### Comandos minimalistas — el cloud NUNCA manda rutas

El payload de un comando es solo `{type, app_id}` (más parámetros explícitamente
permitidos por tipo; `path` únicamente en `BROWSE_FOLDERS`). El agente resuelve
`app_id → folder/launcher/port` contra su **allowlist LOCAL** y solo entonces
ejecuta. **La existencia del archivo NO es autorización**: jamás existe una vía
"ejecuta esta ruta", "ejecuta este comando" o "ejecuta este .bat arbitrario".

### Allowlist local del agente (defensa en profundidad)

Archivo local del agente (`agent/apps.json`): `app_id → {folder, launcher,
port}`. La sincronización Cloud→Agent requiere autorización explícita: cuando la
config de una app cambia en cloud, el agente la recibe como **propuesta
pendiente** y NO la ejecuta hasta aprobarla **localmente en la PC** (CLI
`agent approve <app_id>`, o auto-aprobación únicamente de las apps importadas de
los manifiestos `Apps/*.json` que ya viven en la PC — ese archivo local ES la
autorización). Un atacante que comprometiera el cloud no puede hacer ejecutar
nada que la PC no haya autorizado antes.

### BROWSE_FOLDERS también restringido

El agente tiene `allowed_browse_roots` en su config local (ej. `C:\Projects`,
`D:\Apps`). Una solicitud solo se acepta si el path **resuelto** con
`os.path.realpath` (resuelve symlinks y junctions) cae dentro de alguno de esos
roots; se rechaza traversal (`..`) y cualquier escape. Sin roots configurados,
el browse queda deshabilitado. El cloud nunca toca el filesystem de Windows
directamente — esto además ELIMINA el `POST /api/apps/browse` actual del
servidor (que hoy lista cualquier carpeta sin restricción).

### Ciclo de vida de `HOMEOS_AGENT_TOKEN`

HomeOS Cloud **genera** un token aleatorio (card en Ajustes, protegida por
cookie) → lo **muestra UNA sola vez** → guarda **únicamente su hash** en la
tabla `agents` → tú pegas el valor original en el `.env` local del Windows
Agent. Regenerarlo invalida el anterior. Env del agente:
`HOMEOS_SERVER_URL`, `HOMEOS_AGENT_TOKEN`, `HOMEOS_DEVICE_ID`.

### Comportamiento

- Los endpoints de apps **cambian de implementación, no de contrato**:
  start/stop encolan (respuesta `202 + command_id`; el frontend muestra
  "lanzando…" hasta confirmar por status); `/api/apps/status` responde lo del
  último heartbeat; browse se vuelve comando al agente. El cloud rechaza
  encolar (409) si ya hay `pending|running` para la misma app; el agente procesa
  FIFO secuencial.
- `AppEntry` gana `device_id` (default "pc-principal"); el slug existente sirve
  de `app_id`. folder/launcher/port siguen editables en cloud, pero viajan al
  agente solo por el canal de sincronización con aprobación local — nunca dentro
  de un comando de ejecución. En modo cloud, `run_manifest_import` y
  `_validate_paths` no validan rutas locales.
- **Modo dual por `HOMEOS_ENV`**: `local` → `process_manager` directo como hoy;
  `cloud` → cola. `psutil` se muda al requirements del agente.
- **`/agent` en el repo**: Python chico (stdlib + psutil), su `.env`, su
  allowlist, loop heartbeat + long-poll, la lógica de `process_manager.py`
  portada casi tal cual, logging a archivo con rotación, backoff de reconexión,
  `AccessDenied` de psutil manejado con gracia, autostart con schtasks.
- **PC apagada**: Apps muestra "PC Principal 🔴 Desconectada", botones
  deshabilitados con explicación. Nada más se degrada. Al volver el heartbeat,
  todo se reactiva solo.
- "Abrir panel" de una app usa el `agent_host` del heartbeat (ya no
  `window.location.hostname`) — sigue requiriendo estar en la Tailnet, porque la
  app corre en tu PC.

## 6. Base de datos: dual desde el día 1

- `DATABASE_URL` decide (default `sqlite:///data/homeos.db`; override
  `postgresql+psycopg://...`). **En la VM se arranca con SQLite en el disco
  persistente** — perfectamente válido con 1 usuario y 1 proceso; sin OneDrive,
  allá puede usar `journal_mode=WAL` (en local se queda DELETE). Supabase
  Postgres = F5 opcional: el código soporta ambos desde F1 para que el cambio
  sea solo la URL.
- Tres puntos de bifurcación por dialecto (los únicos): el engine y sus
  `connect_args`/PRAGMAs (solo sqlite), el DDL de `MIGRATIONS`
  (`BOOLEAN DEFAULT 1` → `TRUE` en PG) con `ensure_columns()` portable, y
  `strftime` → helper de mes (`strftime` en sqlite, `to_char` en PG). **Sin
  Alembic** — complejidad innecesaria para un proyecto de un dueño.
- Migración de datos: script Python propio (~50 líneas) que lee sqlite y escribe
  Postgres usando los mismos modelos SQLAlchemy. **`homeos.db` no se borra
  nunca.**

## 7. Plan por fases (cada una espera aprobación)

| Fase | Qué | Validación clave |
|---|---|---|
| **F0** ✅ | Este documento | — |
| **F1** | Backend cloud-ready: config por env (`HOMEOS_ENV` único selector), database dual + guards, helper strftime, `REDIRECT_URI` por env + `state` OAuth, auth cookie + login + middleware, negarse a arrancar en cloud sin secretos, `.env.example`, login mínimo en frontend | Arranca en Windows SIN env vars y todo es idéntico a hoy |
| **F2** | Registry de agentes + cola de comandos + namespaces `/api/agents` vs `/api/agent-bridge` + apps router dual + comandos solo con `app_id` | Modo local intacto; cola encola y expira |
| **F3** | Windows Agent completo (allowlist + aprobación local, FIFO, TTLs, roots de browse) + token desde Ajustes | Start/stop real vía cola |
| **F4** | Frontend: indicador PC 🟢/🔴, botones deshabilitados con explicación, "Abrir panel" con agent_host, estados de comando | Flujo completo con cookie |
| **F5** | Postgres opcional: script de migración, prueba en Supabase | Summary de finanzas idéntico en ambos dialectos |
| **F6** | Deployment: Dockerfile Linux, docker-compose, systemd alternativo, `DEPLOYMENT.md` (VM e2-micro con la decisión de red/costo de §3 verificada al momento, **Tailscale Serve/ts.net**, `TZ=America/Mexico_City`, mover `data/`, OAuth re-registrado, agente en la PC, backup cron diario `sqlite3 .backup` con retención) | HomeOS corriendo en la VM |

Validación transversal de toda fase: build del frontend pasa, el backend local
en Windows arranca igual que siempre, sanity de imports, y `git status` sin
secretos.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Exponer sin auth = finanzas públicas + cola de comandos a tu PC | Auth es F1; no se despliega nada antes. Con Tailscale-first ni siquiera hay puerto público |
| `POST /api/apps/browse` actual lista cualquier carpeta del host | Se elimina del servidor en F2; browse solo vía agente con roots locales |
| Un cloud comprometido ordenando ejecuciones en la PC | Comandos solo con `app_id` + allowlist local con aprobación explícita (existencia ≠ autorización) |
| Secretos de Google en texto plano en la tabla `settings` | Aceptable a corto plazo (DB privada en la VM); mejora futura: moverlos a env |
| **Costo de la IPv4 externa en GCE** | Verificar exención al deploy; sub-opciones IPv6-only / pagar ~$3-4 definidas en §3 |
| Servidor en UTC corre los recordatorios 6-7h | `TZ=America/Mexico_City` en la VM |
| `homeos.db` y uploads NO están en git | Checklist de migración manual en F6 + **backup cron diario** en la VM |
| OneDrive deja de ser la "casa" de los datos | En la VM: WAL + backups; en local todo sigue igual |
| Google cambia Always Free | Bajo; el Dockerfile hace portable a cualquier VPS |
| Supabase free pausa tras 7 días de inactividad | Documentado; con uso diario no ocurre (y F5 es opcional) |
| Google Cloud Console podría rechazar ts.net como redirect URI | Plan B documentado (Cloudflare Tunnel para esa ruta / código manual); el callback valida `state` de un solo uso |

## 9. Fuera de alcance (explícito)

Datetimes con zona horaria, service worker / modo offline (mejora tardía
opcional), multi-usuario, Supabase Storage (el disco de 30 GB lo hace
innecesario), Alembic, y escalar a 2+ workers (el scheduler asume proceso único;
si algún día hace falta, se separa con un flag dedicado).
