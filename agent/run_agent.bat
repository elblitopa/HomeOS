@echo off
rem Corre el HomeOS Agent con el venv del repo, desde la raiz del repo
rem (necesario para que `python -m agent` encuentre el paquete).
cd /d "%~dp0.."
if exist "venv\Scripts\pythonw.exe" (
    start "" "venv\Scripts\pythonw.exe" -m agent run
) else (
    venv\Scripts\python.exe -m agent run
)
