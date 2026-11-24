#!/usr/bin/env bash
# Validate migrations + seed + RLS smoke tests on a plain local Postgres (no Docker needed).
# Usage: PGHOST=/path/to/socket PGPORT=5432 PGUSER=postgres supabase/tests/local/run.sh
# Creates (and drops) a database named beacon_validate.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
DB=${DB:-beacon_validate}
P=(psql -v ON_ERROR_STOP=1 -q -X)

"${P[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${P[@]}" -d "$DB" -f "$here/00_supabase_stub.sql"
for f in "$root"/migrations/*.sql; do
  echo "migration: $(basename "$f")"
  "${P[@]}" -d "$DB" -1 -f "$f"
done
echo "seed: seed.sql"
"${P[@]}" -d "$DB" -1 -f "$root/seed.sql"
echo "tests: rls_smoke.sql"
"${P[@]}" -d "$DB" -f "$here/rls_smoke.sql"
echo "ALL OK"
