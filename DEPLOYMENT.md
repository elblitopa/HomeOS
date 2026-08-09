# HomeOS Cloud — Guía de deployment

Guía paso a paso para llevar HomeOS a una VM de Google Cloud, accesible SOLO
por Tailscale (HTTPS con Tailscale Serve), con el Windows Agent conectando tu
PC. Pensada para seguirse de arriba a abajo sin experiencia de sysadmin.

**Arquitectura final:**

```
                GOOGLE CLOUD VM (homeos-cloud)
                Docker: FastAPI + React + SQLite
                Tailscale en el host + Serve HTTPS
                        │  (tailnet privada; Internet NO entra)
        ┌───────────────┴───────────────┐
   📱 iPhone (PWA)                 🖥️ PC Windows (HomeOS Agent)
   https://homeos-cloud...              │
                                   Apps locales (.bat)
```

**Reglas de oro:**
- HomeOS **nunca** se expone a Internet: nada de abrir el puerto 8777 al
  mundo, nada de Tailscale Funnel. Solo la tailnet.
- Los datos (homeos.db + uploads) viven en `/opt/homeos/data` del host,
  **fuera** del contenedor. El contenedor es desechable; los datos no.
- Los secretos viven en `/opt/homeos/.env` de la VM. Jamás en git.

---

## PARTE 1 — Crear la VM

1. Entra a [console.cloud.google.com](https://console.cloud.google.com) →
   Compute Engine → Instancias de VM → **Crear instancia**.
2. Configuración (elegible para Free Tier):
   - **Nombre:** `homeos-cloud`
   - **Región:** `us-central1` (o `us-west1` / `us-east1`; el Free Tier de
     e2-micro solo aplica en esas tres)
   - **Tipo de máquina:** `e2-micro`
   - **Disco:** 30 GB **Standard persistent disk** (el máximo gratis; no SSD)
   - **SO:** Debian 12 (default está bien)
3. Firewall de la instancia: **NO marques** "Permitir tráfico HTTP/HTTPS".
   HomeOS no va a recibir tráfico público.
4. Crear. Anota que la IP pública solo servirá para el primer SSH.

> 💰 Free Tier: 1 e2-micro + 30 GB standard PD + 1 GB de egreso/mes son
> gratis. Aun así Google puede cobrar centavos por IP externa en reposo según
> tarifas vigentes; revisa Facturación tras el primer día.

## PARTE 2 — Preparar Linux

Conéctate por SSH (botón **SSH** en la consola web de Google, lo más simple) y:

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y git curl ca-certificates
sudo timedatectl set-timezone America/Mexico_City
timedatectl   # verifica: Time zone: America/Mexico_City
```

Crea la estructura de HomeOS:

```bash
sudo mkdir -p /opt/homeos/data /opt/homeos/backups
sudo chown -R "$USER":"$USER" /opt/homeos
```

## PARTE 3 — Instalar Docker (repositorio APT oficial)

VM de producción = Docker Engine + Compose plugin desde el repositorio APT
OFICIAL de Docker para Debian 12 (no el script get.docker.com), siguiendo la
documentación vigente de docs.docker.com:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Cierra la sesión SSH y vuelve a entrar (para que aplique el grupo). Verifica:

```bash
docker --version && docker compose version
sudo systemctl status docker --no-pager | head -5
```

## PARTE 4 — Instalar y conectar Tailscale (en el HOST, no en Docker)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh
```

- Abre el link que imprime y autoriza la máquina con TU cuenta de Tailscale.
- `--ssh` habilita **Tailscale SSH**: podrás administrar la VM desde tu
  tailnet sin depender del SSH público (ver PARTE sobre firewall abajo).
- Verifica: `tailscale status` debe listar `homeos-cloud` y tus dispositivos
  (iPhone, PC). En el iPhone instala la app de Tailscale y entra a la misma
  cuenta si no lo has hecho.
- En [login.tailscale.com](https://login.tailscale.com) → Machines →
  `homeos-cloud` → **Disable key expiry** (para que no se desconecte a los
  90 días).
- MagicDNS debe estar activado (DNS → MagicDNS en la consola de Tailscale);
  ahí mismo ves tu dominio `<tailnet>.ts.net`.

**Firewall (objetivo: cero acceso público — paso OBLIGATORIO, no opcional):**
`default-allow-ssh` (TCP/22 desde 0.0.0.0/0) solo se tolera durante el
bootstrap. El orden importa para no quedarse fuera:
1. instalar Tailscale y autorizar `homeos-cloud`;
2. confirmar `tailscale status`;
3. confirmar desde la PC que `ssh usuario@homeos-cloud` entra por Tailscale SSH;
4. SOLO ENTONCES cerrar el SSH público. En Cloud Shell:
   ```bash
   gcloud compute firewall-rules delete default-allow-ssh --quiet
   ```
   (o restringirla a `35.235.240.0/20` de IAP si quieres conservar el botón
   SSH de la consola:
   `gcloud compute firewall-rules update default-allow-ssh --source-ranges=35.235.240.0/20`)

Jamás crear reglas que abran **8777, 80 ni 443**: no hacen falta — Tailscale
usa túneles salientes y Serve entra por la tailnet.

## PARTE 5 — Clonar HomeOS

```bash
cd /opt/homeos
git clone https://github.com/elblitopa/HomeOS.git app
cd app
git checkout phase6-cloud-deployment   # o la rama/tag aprobado para deploy
```

(El repo es privado: usa un token clásico de GitHub con scope `repo` como
password, o `gh auth login`. No guardes el token en archivos del repo.)

## PARTE 6 — Crear el .env de producción

```bash
cp deploy/.env.cloud.example /opt/homeos/.env
nano /opt/homeos/.env
```

Llena:
- `HOMEOS_PUBLIC_URL` → lo sabrás en la PARTE 9 (la URL de Tailscale Serve);
  puedes dejarlo pendiente hasta entonces.
- `HOMEOS_ACCESS_KEY` → tu clave de login (larga).
- `HOMEOS_SESSION_SECRET` → genera con:
  `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`

Protégelo: `chmod 600 /opt/homeos/.env`

## PARTE 7 — Migrar tus datos (homeos.db + uploads)

**En tu PC (Windows), con calma y sin prisa:**

1. **Detén HomeOS local** (cierra la ventana del servidor). Nada debe estar
   escribiendo la DB.
2. Haz una copia de seguridad local que NO vas a tocar:
   ```powershell
   Copy-Item -Recurse C:\Users\pablo\OneDrive\Documents\Proyectos\HomeOS\data C:\Users\pablo\Desktop\homeos-backup-pre-cloud
   ```
3. Copia `data\homeos.db` y `data\uploads\` a la VM. Con Tailscale el camino
   fácil es `scp` hacia el hostname de la tailnet:
   ```powershell
   scp C:\Users\pablo\OneDrive\Documents\Proyectos\HomeOS\data\homeos.db usuario@homeos-cloud:/opt/homeos/data/homeos.db
   scp -r C:\Users\pablo\OneDrive\Documents\Proyectos\HomeOS\data\uploads usuario@homeos-cloud:/opt/homeos/data/uploads
   ```
   (usuario = tu usuario Linux en la VM; `homeos-cloud` resuelve por MagicDNS)
4. **Verifica integridad en la VM:**
   ```bash
   sqlite3 /opt/homeos/data/homeos.db "PRAGMA integrity_check;"   # → ok
   sqlite3 /opt/homeos/data/homeos.db "SELECT COUNT(*) FROM apps;" # → 5
   find /opt/homeos/data/uploads -type f | wc -l   # compara con tu PC
   ```
   En la PC el conteo equivalente:
   `(Get-ChildItem -Recurse -File data\uploads).Count`
5. La copia local (`homeos-backup-pre-cloud`) NO se borra. Es tu red de
   seguridad permanente.

## PARTE 8 — Arrancar el contenedor

```bash
cd /opt/homeos/app
docker compose build     # compila frontend + imagen (tarda unos minutos)
docker compose up -d
docker compose logs -f --tail 50
```

En los logs debes ver (sin secretos):
- `HomeOS 1.0.0 arrancó en modo cloud | data=/app/data | tz=CST -0600`
- `Scheduler de recordatorios iniciado` ← exactamente UNA vez
- `Uvicorn running on http://0.0.0.0:8777`

Smoke test desde la VM: `curl -s http://127.0.0.1:8777/api/system/ping`

## PARTE 9 — Tailscale Serve (HTTPS dentro de la tailnet)

> ⚠️ La sintaxis de `tailscale serve` ha cambiado entre versiones. Antes de
> ejecutar, verifica la versión y su ayuda: `tailscale version` y
> `tailscale serve --help`. Lo de abajo corresponde a la sintaxis vigente en
> Tailscale ≥ 1.66 aprox.

1. Habilita HTTPS certs para tu tailnet si no lo están (consola Tailscale →
   DNS → HTTPS Certificates → Enable).
2. Publica HomeOS (solo tailnet, en segundo plano):
   ```bash
   sudo tailscale serve --bg 8777
   ```
   Eso proxya `https://homeos-cloud.<tailnet>.ts.net` → `127.0.0.1:8777`.
3. Verifica: `tailscale serve status` debe mostrar el mapeo, y desde el
   iPhone (con Tailscale activo) abre
   `https://homeos-cloud.<tailnet>.ts.net` → pantalla de login de HomeOS.
4. **NUNCA** uses `tailscale funnel` (eso lo publicaría a Internet).
5. Actualiza `HOMEOS_PUBLIC_URL` en `/opt/homeos/.env` con esa URL exacta y
   reinicia: `docker compose restart`.

## PARTE 10 — Google OAuth

El redirect de Google debe apuntar a la URL nueva:

1. [console.cloud.google.com](https://console.cloud.google.com) → APIs y
   servicios → Credenciales → tu OAuth Client de HomeOS.
2. En **Authorized redirect URIs** AGREGA (sin borrar todavía la local):
   `https://homeos-cloud.<tailnet>.ts.net/api/google/callback`
3. Guarda y prueba desde el iPhone: Ajustes → Google → conectar.

> ⚠️ Si Google rechaza el dominio `ts.net` (p. ej. por políticas de dominios
> públicos de terceros): **DETENTE y repórtalo**. No expongas HomeOS a
> Internet como workaround; se evalúa otra solución con calma.

## PARTE 11 — Windows Agent (tu PC)

En la PC, dentro del repo HomeOS:

```powershell
Copy-Item agent\.env.example agent\.env
notepad agent\.env
```

1. `HOMEOS_SERVER_URL=https://homeos-cloud.<tailnet>.ts.net`
2. `HOMEOS_DEVICE_ID=pc-principal` y `HOMEOS_AGENT_NAME=PC Principal`
3. En HomeOS Cloud (iPhone o navegador): Ajustes → PC Principal → **Generar
   token** → cópialo YA (no vuelve a mostrarse) → pégalo como
   `HOMEOS_AGENT_TOKEN` en `agent\.env`.
4. `HOMEOS_ALLOWED_BROWSE_ROOTS=C:\Users\pablo\OneDrive\Documents\Proyectos`
   (o los roots que quieras permitir, separados por `;`)
5. Propuestas de tus 5 apps (NADA queda aprobado solo):
   ```powershell
   venv\Scripts\python.exe -m agent propose
   venv\Scripts\python.exe -m agent pending
   venv\Scripts\python.exe -m agent show airdrop-v2
   ```
6. Aprueba UNA POR UNA las que quieras controlar desde el cloud:
   ```powershell
   venv\Scripts\python.exe -m agent approve airdrop-v2
   venv\Scripts\python.exe -m agent approve catalogo-de-perfumes-2
   venv\Scripts\python.exe -m agent approve content-pilot
   venv\Scripts\python.exe -m agent approve media-downloader
   venv\Scripts\python.exe -m agent approve shopifybot
   ```
7. Arranca el agente y verifica:
   ```powershell
   venv\Scripts\python.exe -m agent run
   ```
   En HomeOS → Apps debe aparecer **PC Principal 🟢 En línea** en ~15 s.
8. Cuando todo funcione, instala el autostart (lo ejecutas TÚ):
   `agent\install_autostart.bat`

**Validación especial de "Abrir panel" desde el iPhone:** el agente reporta
su hostname (`agent_host`) y el frontend abre `http://<agent_host>:<puerto>`.
Verifica en el iPhone que ese hostname resuelva por MagicDNS (debe coincidir
con el nombre de la PC en `tailscale status`). Si NO resuelve (hostname de
Windows ≠ hostname de la tailnet), repórtalo: el plan B es que el agente
reporte explícitamente su nombre de máquina Tailscale — no lo cambies a mano.

## PARTE 12 — iPhone / PWA

1. Tailscale activo en el iPhone (app instalada, misma tailnet, VPN on).
2. Safari → `https://homeos-cloud.<tailnet>.ts.net` → login con tu clave.
3. Compartir → **Agregar a pantalla de inicio** → queda como app.
4. La sesión dura 90 días; el login casi nunca se ve.
5. Prueba con la PC apagada: todo menos Apps debe funcionar; Apps debe decir
   **PC Principal 🔴 Desconectada** con botones deshabilitados.

## PARTE 13 — Backups y restauración

El script ya está en el repo: `scripts/backup-homeos.sh`.

```bash
chmod +x /opt/homeos/app/scripts/backup-homeos.sh
sudo /opt/homeos/app/scripts/backup-homeos.sh    # prueba manual
ls -lh /opt/homeos/backups/
```

Programarlo diario (3:15 AM hora de la VM = CDMX):

```bash
sudo crontab -e
# agregar:
15 3 * * * /opt/homeos/app/scripts/backup-homeos.sh >> /opt/homeos/backups/backup.log 2>&1
```

Hace backup **consistente** de la DB con `sqlite3 .backup` (dentro del
contenedor, seguro aunque HomeOS esté escribiendo) + `uploads-*.tar.gz`, y
conserva los últimos **7** de cada uno.

**Restaurar un backup:**

```bash
cd /opt/homeos/app
docker compose down
cp /opt/homeos/backups/homeos-FECHA.db /opt/homeos/data/homeos.db
tar -xzf /opt/homeos/backups/uploads-FECHA.tar.gz -C /opt/homeos/data
docker compose up -d
```

## PARTE 14 — Actualizar HomeOS en el futuro

Flujo: Claude Code → commit → push → VM:

```bash
cd /opt/homeos/app
git pull
docker compose build
docker compose up -d
docker compose logs -f --tail 30   # verificar arranque + scheduler
```

Los datos no se tocan (viven en /opt/homeos/data). Aun así, correr el backup
antes de actualizar nunca sobra:
`sudo /opt/homeos/app/scripts/backup-homeos.sh`

## PARTE 15 — Rollback

Si una actualización sale mal:

```bash
cd /opt/homeos/app
git log --oneline -10                 # localiza el commit bueno anterior
git checkout <commit-bueno>
docker compose build && docker compose up -d
```

Si además la DB quedó dañada por la versión mala, restaura el backup previo
(PARTE 13). Cuando el fix esté listo: `git checkout <rama>` + `git pull` +
rebuild. La copia original de tu PC (`homeos-backup-pre-cloud`) siempre es el
último recurso.

---

## Checklist de seguridad antes de dar por bueno el deployment

- [ ] `HOMEOS_ENV=cloud` y el login aparece al abrir la URL
- [ ] `/api/*` responde 401 sin sesión (`curl -s -o /dev/null -w "%{http_code}" https://.../api/todos` → 401)
- [ ] `/uploads/*` responde 401 sin sesión
- [ ] Ningún puerto de HomeOS abierto al Internet (revisar reglas de firewall
      de GCP: nada hacia 8777/80/443; probar la IP pública desde datos móviles
      sin Tailscale → no debe responder)
- [ ] SSH público cerrado (solo Tailscale SSH / IAP)
- [ ] `git grep` de secretos limpio; `/opt/homeos/.env` con chmod 600
- [ ] Token del agente generado SOLO desde cloud; DB guarda solo hash
- [ ] homeos.db y uploads fuera de la imagen (borrar y recrear el contenedor
      no pierde datos)
- [ ] Backup manual probado y cron programado
- [ ] Logs sin secretos (`docker compose logs | grep -i token` → nada)
