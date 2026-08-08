@echo off
chcp 65001 >nul
title HomeOS Agent - Instalar auto-inicio
cd /d "%~dp0"

rem El agente corre con el venv del repo (un nivel arriba de agent\).
set "PYTHONW=%~dp0..\venv\Scripts\pythonw.exe"
if not exist "%PYTHONW%" (
    echo [ERROR] No se encontro el venv en: %PYTHONW%
    echo Crea el venv del repo primero o ajusta esta ruta.
    goto :fin
)

if not exist "%~dp0.env" (
    echo [AVISO] No existe agent\.env todavia. El agente no podra conectar
    echo hasta que copies .env.example a .env y pegues el token.
)

echo Intentando registrar tarea programada...
schtasks /Create /F /TN "HomeOS Agent" /SC ONLOGON /RL LIMITED /IT /TR "\"%~dp0run_agent.bat\"" >nul 2>&1
if not errorlevel 1 (
    echo Listo. Tarea programada "HomeOS Agent" creada (inicia al iniciar sesion).
    goto :fin
)

echo La tarea programada requiere permisos de administrador.
echo Usando alternativa: acceso directo en la carpeta de Inicio...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut([Environment]::GetFolderPath('Startup') + '\HomeOS Agent.lnk'); $sc.TargetPath = '%~dp0run_agent.bat'; $sc.WorkingDirectory = '%~dp0..'; $sc.Description = 'HomeOS Windows Agent'; $sc.Save()"
if errorlevel 1 (
    echo [ERROR] No se pudo crear el acceso directo.
) else (
    echo Listo. El agente arrancara automaticamente al iniciar sesion.
)

:fin
pause
