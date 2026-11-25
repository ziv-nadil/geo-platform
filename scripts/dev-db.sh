#!/usr/bin/env bash
# Local development database: PostgreSQL 16 + Supabase compat stub + real migrations + demo seed.
# No Docker needed. Idempotent: re-running applies only migrations that have not run yet.
#
#   scripts/dev-db.sh            start (init on first run), apply pending migrations, seed if new
#   scripts/dev-db.sh --reset    drop and recreate the database, then migrate + seed
#   scripts/dev-db.sh --stop     stop the cluster
#
# Data lives in <repo>/.devdb (gitignored). Prints DATABASE_URL at the end; put it in web/.env.local.
# Env: DEVDB_PORT (default 54322), DEVDB_NAME (default beacon), PG_BIN (default /usr/lib/postgresql/16/bin).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT/.devdb"
PGDATA="$DATA_DIR/data"
PORT="${DEVDB_PORT:-54322}"
DB="${DEVDB_NAME:-beacon}"
if [ -z "${PG_BIN:-}" ]; then
  for c in /usr/lib/postgresql/16/bin /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin; do
    [ -x "$c/initdb" ] && PG_BIN="$c" && break
  done
  if [ -z "${PG_BIN:-}" ] && command -v brew >/dev/null 2>&1; then PG_BIN="$(brew --prefix postgresql@16 2>/dev/null)/bin"; fi
  PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
fi
LOG="$DATA_DIR/postgres.log"

die() { echo "dev-db: $*" >&2; exit 1; }
[ -x "$PG_BIN/initdb" ] || die "PostgreSQL 16 not found at $PG_BIN (apt install postgresql-16, or set PG_BIN)"
command -v psql >/dev/null || die "psql not found"

# initdb/postgres refuse to run as root: run cluster commands as the 'postgres' OS user then.
as_pg() {
  if [ "$(id -u)" = "0" ]; then
    su postgres -s /bin/bash -c "$(printf '%q ' "$@")"
  else
    "$@"
  fi
}

mkdir -p "$DATA_DIR"
if [ "$(id -u)" = "0" ]; then chown -R postgres:postgres "$DATA_DIR"; fi

running() { as_pg "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; }

if [ "${1:-}" = "--stop" ]; then
  running && as_pg "$PG_BIN/pg_ctl" -D "$PGDATA" stop -m fast
  exit 0
fi

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "dev-db: initializing cluster in $PGDATA"
  as_pg "$PG_BIN/initdb" -D "$PGDATA" -U postgres -A trust --encoding=UTF8 >/dev/null
fi

if ! running; then
  echo "dev-db: starting on localhost:$PORT"
  as_pg "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$LOG" -w \
    -o "-p $PORT -k $DATA_DIR -c listen_addresses=localhost" start >/dev/null
fi

export PGOPTIONS="-c client_min_messages=warning"
P=(psql -X -q -v ON_ERROR_STOP=1 -h localhost -p "$PORT" -U postgres)

fresh=0
if [ "${1:-}" = "--reset" ]; then
  "${P[@]}" -d postgres -c "drop database if exists $DB with (force)"
fi
if ! "${P[@]}" -d postgres -tAc "select 1 from pg_database where datname = '$DB'" | grep -q 1; then
  "${P[@]}" -d postgres -c "create database $DB"
  fresh=1
fi

"${P[@]}" -d "$DB" -f "$ROOT/supabase/dev/compat.sql"
"${P[@]}" -d "$DB" -c "create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, applied_at timestamptz default now());"

applied=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  base="$(basename "$f" .sql)"
  version="${base%%_*}"
  if "${P[@]}" -d "$DB" -tAc "select 1 from supabase_migrations.schema_migrations where version = '$version'" | grep -q 1; then
    continue
  fi
  echo "dev-db: migration $base"
  "${P[@]}" -d "$DB" -1 -f "$f" \
    -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$base')" >/dev/null
  applied=$((applied + 1))
done

if [ "$fresh" = "1" ]; then
  echo "dev-db: seeding demo data"
  "${P[@]}" -d "$DB" -1 -f "$ROOT/supabase/seed.sql" >/dev/null
elif [ "$applied" -gt 0 ]; then
  "${P[@]}" -d "$DB" -c "select public.refresh_metrics()" >/dev/null
fi

echo "dev-db: ready ($applied migration(s) applied$([ "$fresh" = 1 ] && echo ', seeded'))"
echo "DATABASE_URL=postgres://postgres@localhost:$PORT/$DB"
