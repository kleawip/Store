# Shared settings for the database scripts. PG_BIN defaults to Postgres.app on this Mac, else PATH.
PG_BIN="${PG_BIN:-}"
if [ -z "$PG_BIN" ]; then
  if [ -x /Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump ]; then PG_BIN=/Applications/Postgres.app/Contents/Versions/latest/bin
  else PG_BIN="$(dirname "$(command -v pg_dump)")"; fi
fi
PG_HOST="${PG_HOST:-localhost}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/backups}"
db_name() { printf '%s' "$1" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#'; }
