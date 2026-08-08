@echo off
chcp 65001 >nul
title HomeOS Agent - Quitar auto-inicio

echo Quitando tarea programada (si existe)...
schtasks /Delete /F /TN "HomeOS Agent" >nul 2>&1

echo Quitando acceso directo de Inicio (si existe)...
powershell -NoProfile -Command "$p = [Environment]::GetFolderPath('Startup') + '\HomeOS Agent.lnk'; if (Test-Path $p) { Remove-Item $p }"

echo Listo. El agente ya no arrancara con Windows.
pause
