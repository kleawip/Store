#!/usr/bin/env bash
# Logical backup of a Kleawip Postgres database (custom format, compressed).
#   scripts/db/backup.sh [DATABASE_URL]        default: DATABASE_URL from the environment
# Writes backups/<db>-<UTC timestamp>.dump and prints the path. Backups contain customer data once live:
# keep them out of git (backups/ is ignored) and store production copies only in the approved backup location.
set -euo pipefail
source "$(dirname "$0")/_pg.sh"

url="${1:-${DATABASE_URL:-}}"
[ -n "$url" ] || { echo "Usage: $0 DATABASE_URL (or set DATABASE_URL)" >&2; exit 2; }
name="$(db_name "$url")"
mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/${name}-$(date -u +%Y%m%dT%H%M%SZ).dump"
"$PG_BIN/pg_dump" --format=custom --no-owner --no-privileges --file="$file" "$url"
chmod 600 "$file"
echo "$file"
