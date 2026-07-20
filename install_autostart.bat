@echo off
chcp 65001 >nul
title HomeOS - Instalar auto-inicio
cd /d "%~dp0"

echo Intentando registrar tarea programada...
schtasks /Create /F /TN "HomeOS" /SC ONLOGON /RL LIMITED /IT /TR "\"%~dp0HomeOS.bat\"" >nul 2>&1
if not errorlevel 1 (
    echo Listo. Tarea programada "HomeOS" creada.
    goto :fin
)

echo La tarea programada requiere permisos de administrador.
echo Usando alternativa: acceso directo en la carpeta de Inicio...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut([Environment]::GetFolderPath('Startup') + '\HomeOS.lnk'); $sc.TargetPath = '%~dp0HomeOS.bat'; $sc.WorkingDirectory = '%~dp0'; $sc.Description = 'HomeOS - Panel Central'; $sc.Save()"
if errorlevel 1 (
    echo [ERROR] No se pudo crear el acceso directo.
) else (
    echo Listo. HomeOS arrancara automaticamente al iniciar sesion.
)

:fin
pause
