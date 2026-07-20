# HomeOS

Panel central para lanzar y monitorear tus proyectos, accesible desde todos tus dispositivos vía Tailscale.

- **Puerto:** 8777 (escucha en `0.0.0.0`, accesible en `http://<ip-tailscale>:8777`)
- **Stack:** FastAPI + SQLite (backend) · React + Vite + Tailwind (frontend, compilado en `frontend/dist`)

## Uso diario

Doble clic a **`HomeOS.bat`** — crea el venv si falta, instala dependencias, arranca el servidor y abre el navegador.

Ya hay un acceso directo en la carpeta de Inicio de Windows, así que HomeOS arranca solo al iniciar sesión. Para quitarlo: `uninstall_autostart.bat`. Para volver a ponerlo: `install_autostart.bat`.

## Registrar apps

Dos formas:

1. **Desde la UI** (recomendada): botón "＋ Agregar app" → nombre, carpeta del proyecto (con botón Explorar), archivo `.bat` y puerto. Opcional: icono y banner.
2. **Drop-folder**: crea un `.json` en `Apps/` (ver `Apps/ejemplo.json.example`) y reinicia HomeOS o llama `POST /api/apps/import`.

HomeOS **no copia ni modifica** las carpetas de los proyectos — solo las referencia.

### Cómo funciona

- **Estado**: se detecta si la app corre haciendo un chequeo TCP a su puerto cada 5 s (funciona aunque la hayas iniciado a mano, fuera de HomeOS).
- **Iniciar**: lanza el `.bat` del proyecto en su propia consola visible.
- **Detener**: mata el árbol de procesos (`taskkill /T /F`). Si la app se inició fuera de HomeOS, se busca el proceso por puerto; en ese caso su consola queda abierta en el `pause` (limitación conocida).
- **Abrir panel**: abre `http://<mismo-host>:<puerto>` — usa el mismo host con el que entraste a HomeOS, así que funciona igual en local que por Tailscale.

## Acceso remoto (Tailscale)

Entra desde cualquier dispositivo de tu tailnet a `http://<ip-100.x>:8777` o con MagicDNS `http://pc-pablo:8777`.

Si no responde desde otro dispositivo, permite el puerto en el firewall (una vez, como administrador):

```
netsh advfirewall firewall add rule name="HomeOS" dir=in action=allow protocol=TCP localport=8777
```

Nota: para abrir los paneles de las otras apps remotamente, sus puertos (7432, 8080, 5137, 5000...) también deben estar permitidos — Windows suele preguntarlo la primera vez que corre cada app.

## Desarrollo

- Backend: `venv\Scripts\python -m uvicorn backend.main:app --host 0.0.0.0 --port 8777`
- Frontend en vivo: `cd frontend && npm run dev` (Vite en 5173 con proxy a 8777)
- Compilar frontend: `build.bat` (requiere Node.js LTS; el runtime solo necesita Python)

La base de datos vive en `data/homeos.db` (SQLite). Consejo OneDrive: clic derecho a la carpeta HomeOS → "Mantener siempre en este dispositivo".

## Fases futuras

El sidebar ya tiene el espacio reservado: Calendario, Tareas, Finanzas & Negocios, Rutinas, Notas y Archivos. Cada módulo nuevo = un router en `backend/routers/`, modelos en `backend/models/` y una carpeta en `frontend/src/features/`. El stub de notificaciones Discord está en `backend/notifications/discord.py`.
