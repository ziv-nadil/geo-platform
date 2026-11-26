#!/usr/bin/env bash
# Runs the e2e suites. Needs: scripts/dev-db.sh (seeded DB) and `pnpm install`.
# Starts one `next dev` per identity (dev auth bypass works only on localhost DB, NODE_ENV!=production).
set -uo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL:-postgres://postgres@localhost:54322/beacon}"
PORT=3100
DANA=00000000-0000-4000-a000-000000000011     # Northwind owner
LUMEN=00000000-0000-4000-a000-000000000021    # Lumen owner (org in onboarding)
ADMIN=00000000-0000-4000-a000-000000000001    # platform admin
run() { # name userId aal suite
  pkill -f "next dev" 2>/dev/null; pkill -f next-server 2>/dev/null; sleep 2
  env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    ${2:+DEV_AUTH_USER_ID=$2} ${3:+DEV_AUTH_AAL=$3} nohup npx next dev -p $PORT >"/tmp/e2e-$1.log" 2>&1 &
  for i in $(seq 60); do curl -s -o /dev/null localhost:$PORT/login && break; sleep 1; done
  curl -s -o /dev/null localhost:$PORT/app/northwind   # warm
  E2E_JSON="/tmp/e2e-$1.json" npx playwright test -c e2e/playwright.config.ts "${@:4}" --trace off
}
run anon  ""      ""     anon
run client $DANA  ""     client
run lumen $LUMEN  ""     lumen
run admin $ADMIN  aal2   admin/admin-aal2
run admin1 $ADMIN aal1   admin/admin-aal1
pkill -f "next dev"; pkill -f next-server
