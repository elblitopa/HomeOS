@echo off
chcp 65001 >nul
title HomeOS
cd /d "%~dp0"

echo.
echo  ============================================
echo             HomeOS  -  Panel Central
echo  ============================================
echo.

REM --- Detectar Python ---
set "PY="
py -3.11 --version >nul 2>&1
if not errorlevel 1 (
    set "PY=py -3.11"
    goto :python_ok
)
py --version >nul 2>&1
if not errorlevel 1 (
    set "PY=py"
    goto :python_ok
)
python --version >nul 2>&1
if not errorlevel 1 (
    set "PY=python"
    goto :python_ok
)
echo [ERROR] No se encontro Python. Instala Python 3.11+ desde https://python.org
pause
exit /b 1

:python_ok
echo [1/3] Python detectado: %PY%

REM --- Entorno virtual ---
if not exist "venv\Scripts\activate.bat" (
    echo [2/3] Creando entorno virtual...
    %PY% -m venv venv
    if errorlevel 1 (
        echo [ERROR] No se pudo crear el entorno virtual.
        pause
        exit /b 1
    )
)
call venv\Scripts\activate.bat

echo [2/3] Instalando dependencias...
pip install -r requirements.txt --quiet --disable-pip-version-check

echo [3/3] Iniciando servidor en http://localhost:8777
echo        (accesible via Tailscale en el puerto 8777)
echo.

start "" /min cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:8777"

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8777

echo.
echo El servidor se detuvo.
pause
