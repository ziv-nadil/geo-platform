#!/usr/bin/env bash
# Production provisioning for Beacon GEO. See docs/ops/runbook.md for the full procedure.
#
#   scripts/provision.sh [--dry-run] [--skip-deploy]
#
# Required env:   SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD VERCEL_TOKEN
# Optional env (copied to Vercel when set; features stay `not_configured` without them):
#   VERCEL_PROJECT (default beacon-geo) VERCEL_SCOPE (team slug)
#   INFISICAL_{PROVISIONER,APP_WRITER,WORKER}_{IDENTITY_ID|CLIENT_ID|CLIENT_SECRET|MACHINE_IDENTITY_ID} INFISICAL_SITE_URL
#   INTAKE_JWE_PRIVATE_JWK  STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET  DNS_VERIFY_SECRET AWS_EXTERNAL_ID_SECRET
#   GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET AGENCY_GOOGLE_REFRESH_TOKEN AGENCY_GOOGLE_EMAIL AGENCY_EMAIL
#   AGENCY_GITHUB_TOKEN AGENCY_BING_API_KEY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
#   GOOGLE_ADS_DEVELOPER_TOKEN GOOGLE_ADS_LOGIN_CUSTOMER_ID GOOGLE_ADS_API_VERSION NEXT_PUBLIC_APP_URL
# Never prints secret values.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY=0; SKIP_DEPLOY=0
for a in "$@"; do case "$a" in --dry-run) DRY=1 ;; --skip-deploy) SKIP_DEPLOY=1 ;; *) echo "unknown flag $a" >&2; exit 2 ;; esac; done

missing=()
for v in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD VERCEL_TOKEN; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "provision: missing required env: ${missing[*]}" >&2
  echo "provision: add them in the environment settings (never in chat), then re-run. See docs/ops/runbook.md." >&2
  exit 1
fi
for t in npx python3 curl; do command -v "$t" >/dev/null || { echo "provision: '$t' not found" >&2; exit 1; }; done

run() { echo "+ $*" | sed -E 's/(--token|-p|--password)[= ][^ ]+/\1 ***/g'; [ "$DRY" = 1 ] || "$@"; }
API=https://api.supabase.com/v1
REF="$SUPABASE_PROJECT_REF"
VPROJ="${VERCEL_PROJECT:-beacon-geo}"
SCOPE_ARGS=(); [ -n "${VERCEL_SCOPE:-}" ] && SCOPE_ARGS=(--scope "$VERCEL_SCOPE")

echo "== 1/4 Supabase: link + push migrations (seed is NOT pushed to prod)"
cd "$ROOT"
run npx -y supabase@latest link --project-ref "$REF" -p "$SUPABASE_DB_PASSWORD"
run npx -y supabase@latest db push --linked -p "$SUPABASE_DB_PASSWORD"

echo "== 2/4 Supabase: read API keys and pooler URL (Management API)"
mapi() { curl -fsS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$API$1"; }
if [ "$DRY" = 1 ]; then
  PUBLISHABLE="dry-run"; SECRET="dry-run"; DBURL="dry-run"
else
  KEYS_JSON="$(mapi "/projects/$REF/api-keys?reveal=true")" || { echo "provision: cannot read API keys (token scope?)" >&2; exit 1; }
  PUBLISHABLE="$(python3 -c 'import json,sys; k=[x for x in json.load(sys.stdin) if x.get("type")=="publishable"]; print(k[0]["api_key"] if k else "")' <<<"$KEYS_JSON")"
  SECRET="$(python3 -c 'import json,sys; k=[x for x in json.load(sys.stdin) if x.get("type")=="secret"]; print(k[0]["api_key"] if k else "")' <<<"$KEYS_JSON")"
  [ -n "$PUBLISHABLE" ] && [ -n "$SECRET" ] || { echo "provision: project has no publishable/secret API keys yet. Create them in Supabase > Project Settings > API Keys." >&2; exit 1; }
  POOLER_JSON="$(mapi "/projects/$REF/config/database/pooler")"
  DBURL="$(python3 -c '
import json,sys,urllib.parse
rows=json.load(sys.stdin); rows=rows if isinstance(rows,list) else [rows]
t=[r for r in rows if r.get("pool_mode")=="transaction"] or rows
print(t[0]["connection_string"])' <<<"$POOLER_JSON")"
  DBURL="${DBURL//\[YOUR-PASSWORD\]/$(python3 -c 'import urllib.parse,os; print(urllib.parse.quote(os.environ["SUPABASE_DB_PASSWORD"], safe=""))')}"
fi
SUPABASE_URL="https://$REF.supabase.co"

echo "== 3/4 Vercel: link project and set production env"
run npx -y vercel@latest link --yes --project "$VPROJ" --cwd "$ROOT/web" --token "$VERCEL_TOKEN" "${SCOPE_ARGS[@]}"
setenv() { # name value
  local name="$1" value="$2"
  [ -n "$value" ] || return 0
  echo "+ vercel env add $name production (value hidden)"
  [ "$DRY" = 1 ] && return 0
  npx -y vercel@latest env rm "$name" production --yes --cwd "$ROOT/web" --token "$VERCEL_TOKEN" "${SCOPE_ARGS[@]}" >/dev/null 2>&1 || true
  printf '%s' "$value" | npx -y vercel@latest env add "$name" production --sensitive --cwd "$ROOT/web" --token "$VERCEL_TOKEN" "${SCOPE_ARGS[@]}" >/dev/null
}
setenv NEXT_PUBLIC_SUPABASE_URL "$SUPABASE_URL"
setenv NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$PUBLISHABLE"
setenv SUPABASE_SECRET_KEY "$SECRET"
setenv DATABASE_URL "$DBURL"
for v in NEXT_PUBLIC_APP_URL INFISICAL_SITE_URL \
  INFISICAL_PROVISIONER_IDENTITY_ID INFISICAL_PROVISIONER_CLIENT_ID INFISICAL_PROVISIONER_CLIENT_SECRET INFISICAL_PROVISIONER_MACHINE_IDENTITY_ID \
  INFISICAL_APP_WRITER_IDENTITY_ID INFISICAL_APP_WRITER_CLIENT_ID INFISICAL_APP_WRITER_CLIENT_SECRET INFISICAL_APP_WRITER_MACHINE_IDENTITY_ID INFISICAL_APP_WRITER_PROJECT_ROLE \
  INFISICAL_WORKER_IDENTITY_ID INFISICAL_WORKER_CLIENT_ID INFISICAL_WORKER_CLIENT_SECRET INFISICAL_WORKER_MACHINE_IDENTITY_ID INFISICAL_WORKER_PROJECT_ROLE \
  INTAKE_JWE_PRIVATE_JWK INTAKE_JWE_PRIVATE_JWK_PREVIOUS STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET DNS_VERIFY_SECRET AWS_EXTERNAL_ID_SECRET \
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET AGENCY_GOOGLE_REFRESH_TOKEN AGENCY_GOOGLE_EMAIL AGENCY_EMAIL AGENCY_GITHUB_TOKEN AGENCY_BING_API_KEY \
  AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY GOOGLE_ADS_DEVELOPER_TOKEN GOOGLE_ADS_LOGIN_CUSTOMER_ID GOOGLE_ADS_API_VERSION; do
  setenv "$v" "${!v:-}"
done
not_set=()
for v in INTAKE_JWE_PRIVATE_JWK STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET DNS_VERIFY_SECRET INFISICAL_APP_WRITER_IDENTITY_ID INFISICAL_WORKER_IDENTITY_ID; do
  [ -n "${!v:-}" ] || not_set+=("$v")
done
[ ${#not_set[@]} -gt 0 ] && echo "provision: note: not set (features report not_configured): ${not_set[*]}"

if [ "$SKIP_DEPLOY" = 1 ]; then echo "== 4/4 deploy skipped"; exit 0; fi
echo "== 4/4 Vercel: production deploy"
run npx -y vercel@latest deploy --prod --yes --cwd "$ROOT/web" --token "$VERCEL_TOKEN" "${SCOPE_ARGS[@]}"
echo "provision: done. Next: create the first platform admin (runbook step 5)."
