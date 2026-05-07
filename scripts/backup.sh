#!/bin/sh
# backup.sh
# Nightly encrypted backup of PostgreSQL and uploads/exports volume.
# Expected to be run via cron: 0 2 * * * /opt/proposal-agent/scripts/backup.sh

set -e

BACKUP_DIR="${BACKUP_DIR:-/mnt/backups/proposal-agent}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

echo "Starting backup at $TIMESTAMP..."

# Database dump (custom format)
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" \
    > "$BACKUP_DIR/db-$TIMESTAMP.dump"

# Compress + age encryption (example; plug in actual encryption key management)
gzip "$BACKUP_DIR/db-$TIMESTAMP.dump"

echo "Database backed up to $BACKUP_DIR/db-$TIMESTAMP.dump.gz"

# Optional: copy exports
if [ -d /mnt/data/exports ]; then
    tar -czf "$BACKUP_DIR/exports-$TIMESTAMP.tar.gz" -C /mnt/data exports
fi

# Retention
find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -delete

echo "Backup complete. Retention: $RETENTION_DAYS days."
