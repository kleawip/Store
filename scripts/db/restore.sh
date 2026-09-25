#!/usr/bin/env bash
# Restores a backup into a NEW, empty database. Refuses to overwrite an existing database.
#   scripts/db/restore.sh backups/kleawip_dev-20260925T120000Z.dump kleawip_restore_check
set -euo pipefail
source "$(dirname "$0")/_pg.sh"

file="${1:-}"; target="${2:-}"
[ -f "$file" ] && [ -n "$target" ] || { echo "Usage: $0 BACKUP_FILE NEW_DATABASE_NAME" >&2; exit 2; }
[[ "$target" =~ ^[a-z][a-z0-9_]{2,62}$ ]] || { echo "Database name must be lowercase letters, digits and _" >&2; exit 2; }
if "$PG_BIN/psql" -h "$PG_HOST" -Atc "select 1 from pg_database where datname = '$target'" postgres | grep -q 1; then
  echo "Refusing: database '$target' already exists. Restores only go into a new database." >&2
  exit 1
fi
"$PG_BIN/createdb" -h "$PG_HOST" "$target"
"$PG_BIN/pg_restore" --no-owner --no-privileges --exit-on-error -h "$PG_HOST" -d "$target" "$file"
echo "Restored $file into $target"
