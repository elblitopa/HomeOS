#!/usr/bin/env bash
# ============================================================
# Backup de HomeOS Cloud: homeos.db (consistente) + uploads/.
#
# - La DB se respalda con `sqlite3 .backup` DENTRO del contenedor
#   (la API segura de SQLite: consistente aunque HomeOS esté
#   escribiendo). El archivo cae en el bind mount, así que el
#   host lo ve y lo mueve a /opt/homeos/backups/.
# - uploads/ se respalda con tar desde el host.
# - Retención: se conservan los últimos 7 backups de cada cosa.
#
# Uso manual:   sudo /opt/homeos/app/scripts/backup-homeos.sh
# Cron diario (3:15 AM hora de la VM), editar con `sudo crontab -e`:
#   15 3 * * * /opt/homeos/app/scripts/backup-homeos.sh >> /opt/homeos/backups/backup.log 2>&1
#
# Restaurar: ver DEPLOYMENT.md PARTE 13 (backups y restauración).
# ============================================================
set -euo pipefail

DATA_DIR="/opt/homeos/data"
BACKUP_DIR="/opt/homeos/backups"
COMPOSE_DIR="/opt/homeos/app"
KEEP=7
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

# ---------- 1) homeos.db consistente ----------
TMP_IN_MOUNT="$DATA_DIR/.backup-tmp.db"
rm -f "$TMP_IN_MOUNT"
if docker compose -f "$COMPOSE_DIR/docker-compose.yml" ps --status running homeos >/dev/null 2>&1 \
   && [ -n "$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" ps -q homeos)" ]; then
  # contenedor corriendo: .backup dentro del contenedor (API segura)
  docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T homeos \
    sqlite3 /app/data/homeos.db ".backup '/app/data/.backup-tmp.db'"
elif command -v sqlite3 >/dev/null 2>&1; then
  # contenedor apagado: sqlite3 del host directo sobre el archivo
  sqlite3 "$DATA_DIR/homeos.db" ".backup '$TMP_IN_MOUNT'"
else
  # sin contenedor y sin sqlite3: copia fría (válida solo apagado)
  cp "$DATA_DIR/homeos.db" "$TMP_IN_MOUNT"
fi
mv "$TMP_IN_MOUNT" "$BACKUP_DIR/homeos-$STAMP.db"

# ---------- 2) uploads/ ----------
tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$DATA_DIR" uploads

# ---------- 3) retención: conservar los últimos $KEEP de cada tipo ----------
ls -1t "$BACKUP_DIR"/homeos-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
ls -1t "$BACKUP_DIR"/uploads-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "[$(date '+%F %T')] backup OK: homeos-$STAMP.db + uploads-$STAMP.tar.gz"
