#!/usr/bin/env bash
# Backup → restore → verify rehearsal (IMPLEMENTATION_PLAN: "backup/restore rehearsal").
# Backs up the source, restores into a throwaway database, compares row counts of every table,
# checks the migration history matches, then drops the throwaway database. Exit code 0 = passed.
#   scripts/db/rehearse-restore.sh [DATABASE_URL]
set -euo pipefail
source "$(dirname "$0")/_pg.sh"

url="${1:-${DATABASE_URL:-postgres://localhost:5432/kleawip_dev}}"
check="kleawip_restore_check_$(date +%s)"
file="$("$(dirname "$0")/backup.sh" "$url")"
trap '"$PG_BIN/dropdb" -h "$PG_HOST" --if-exists "$check" >/dev/null 2>&1 || true' EXIT
"$(dirname "$0")/restore.sh" "$file" "$check" >/dev/null

counts() {
  "$PG_BIN/psql" "$1" -At -c "
    select string_agg(format('%s=%s', table_name, (xpath('/row/c/text()',
      query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text), ' ' order by table_name)
    from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"
}
migrations() { "$PG_BIN/psql" "$1" -At -c "select count(*) || ':' || coalesce(max(created_at)::text,'') from drizzle.__drizzle_migrations"; }

check_url="$(printf '%s' "$url" | sed -E "s#/[^/?]+(\?|$)#/$check\1#")"
source_counts="$(counts "$url")"; restored_counts="$(counts "$check_url")"
source_migrations="$(migrations "$url")"; restored_migrations="$(migrations "$check_url")"

if [ "$source_counts" != "$restored_counts" ] || [ "$source_migrations" != "$restored_migrations" ]; then
  echo "FAILED: restored database differs from the source." >&2
  diff <(tr ' ' '\n' <<<"$source_counts") <(tr ' ' '\n' <<<"$restored_counts") >&2 || true
  exit 1
fi
echo "PASSED: $(wc -w <<<"$source_counts" | tr -d ' ') tables, row counts and migration history match. Backup kept at $file"
