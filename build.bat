@echo off
chcp 65001 >nul
title HomeOS - Compilar frontend
cd /d "%~dp0frontend"

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Se necesita Node.js LTS. Instalalo desde https://nodejs.org
    pause
    exit /b 1
)

echo [1/2] Instalando dependencias de npm...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install fallo.
    pause
    exit /b 1
)

echo [2/2] Compilando frontend...
call npm run build
if errorlevel 1 (
    echo [ERROR] La compilacion fallo.
    pause
    exit /b 1
)

echo.
echo Build listo en frontend\dist
pause
