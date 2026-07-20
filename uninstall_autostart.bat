@echo off
chcp 65001 >nul
title HomeOS - Quitar auto-inicio

schtasks /Delete /F /TN "HomeOS" >nul 2>&1
powershell -NoProfile -Command "$p = [Environment]::GetFolderPath('Startup') + '\HomeOS.lnk'; if (Test-Path $p) { Remove-Item $p -Force }"
echo Listo. HomeOS ya no arrancara automaticamente.
pause
