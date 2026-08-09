# ============================================================
# HomeOS Cloud — imagen única (FastAPI + frontend compilado).
#
# Multi-stage: Node compila el frontend; la imagen final es solo
# Python + backend + dist. NO incluye: el Windows Agent (agent/),
# psutil, secretos, ni datos — homeos.db y uploads/ viven FUERA,
# en el bind mount /opt/homeos/data -> /app/data.
# ============================================================

# ---------- etapa 1: compilar el frontend ----------
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- etapa 2: runtime ----------
FROM python:3.12-slim

# sqlite3 CLI: lo usa el script de backup (sqlite3 .backup) vía docker exec.
# tzdata: los recordatorios/scheduler viven en hora de Ciudad de México.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata sqlite3 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    TZ=America/Mexico_City \
    HOMEOS_ENV=cloud \
    HOMEOS_DATA_DIR=/app/data

WORKDIR /app

COPY requirements-cloud.txt ./
RUN pip install --no-cache-dir -r requirements-cloud.txt

COPY backend/ backend/
COPY Apps/ Apps/
COPY --from=frontend /build/dist frontend/dist

# el puerto solo se publica en el loopback del host (ver docker-compose.yml);
# Tailscale Serve es la única puerta de entrada
EXPOSE 8777

# UN worker, siempre: el scheduler (recordatorios, espejo de Google, FX)
# debe existir exactamente una vez. Escalar workers duplicaría recordatorios.
CMD ["python", "-m", "uvicorn", "backend.main:app", \
     "--host", "0.0.0.0", "--port", "8777", "--workers", "1", "--no-access-log"]
