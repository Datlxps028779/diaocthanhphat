#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

PRODUCTION_REF="itgxladqskdcbwsbmuyi"
ENV_FILE=".env.local"
DUMP_FILE="${HOME}/commerce-staging-public-schema.sql"
PSQL_BIN="${PSQL_BIN:-/opt/homebrew/opt/postgresql@17/bin/psql}"
PG_DUMP_BIN="${PG_DUMP_BIN:-/opt/homebrew/opt/postgresql@17/bin/pg_dump}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[commerce-staging] Missing .env.local" >&2
  exit 2
fi

STAGING_REF="$(node -e 'const fs=require("fs"); const line=fs.readFileSync(".env.local","utf8").split(/\r?\n/).find(v=>v.startsWith("NEXT_PUBLIC_SUPABASE_URL=")); if(!line) process.exit(2); const raw=line.slice(line.indexOf("=")+1).trim(); const ref=new URL(raw).hostname.split(".")[0]; if(!ref) process.exit(2); process.stdout.write(ref);')"

if [[ "$STAGING_REF" == "$PRODUCTION_REF" ]]; then
  echo "[commerce-staging] BLOCKED: .env.local still points to production." >&2
  exit 2
fi

if [[ -z "${PRODUCTION_DATABASE_URL:-}" ]]; then
  read -r -p "Paste PRODUCTION database URI (source schema; expected project ref ${PRODUCTION_REF}): " PRODUCTION_DATABASE_URL_TEMPLATE
  read -r -s -p "Production database password (schema-only read): " PRODUCTION_DB_PASSWORD
  printf '\n'
  PRODUCTION_DATABASE_URL="$(DATABASE_URL_TEMPLATE="$PRODUCTION_DATABASE_URL_TEMPLATE" DATABASE_PASSWORD="$PRODUCTION_DB_PASSWORD" node -e 'const t=process.env.DATABASE_URL_TEMPLATE||""; const p=encodeURIComponent(process.env.DATABASE_PASSWORD||""); process.stdout.write(t.replace("[YOUR-PASSWORD]",p).replace("YOUR_PASSWORD",p));')"
  unset PRODUCTION_DATABASE_URL_TEMPLATE PRODUCTION_DB_PASSWORD
fi
if [[ -z "$PRODUCTION_DATABASE_URL" ]]; then
  echo "[commerce-staging] PRODUCTION_DATABASE_URL is required." >&2
  exit 2
fi
if [[ "$PRODUCTION_DATABASE_URL" == *"$STAGING_REF"* ]]; then
  echo "[commerce-staging] BLOCKED: source URL points to staging." >&2
  exit 2
fi

if [[ -z "${STAGING_DATABASE_URL:-}" ]]; then
  read -r -p "Paste STAGING database URI (destination; expected project ref ${STAGING_REF}): " STAGING_DATABASE_URL_TEMPLATE
  read -r -s -p "Staging database password: " STAGING_DB_PASSWORD
  printf '\n'
  STAGING_DATABASE_URL="$(STAGING_DATABASE_URL_TEMPLATE="$STAGING_DATABASE_URL_TEMPLATE" STAGING_DB_PASSWORD="$STAGING_DB_PASSWORD" node -e 'const t=process.env.STAGING_DATABASE_URL_TEMPLATE||""; const p=encodeURIComponent(process.env.STAGING_DB_PASSWORD||""); process.stdout.write(t.replace("[YOUR-PASSWORD]",p).replace("YOUR_PASSWORD",p));')"
  unset STAGING_DATABASE_URL_TEMPLATE STAGING_DB_PASSWORD
fi
if [[ -z "$STAGING_DATABASE_URL" ]]; then
  echo "[commerce-staging] STAGING_DATABASE_URL is required." >&2
  exit 2
fi
if [[ "$STAGING_DATABASE_URL" == *"$PRODUCTION_REF"* ]]; then
  echo "[commerce-staging] BLOCKED: destination URL contains production ref." >&2
  exit 2
fi
if [[ "$STAGING_DATABASE_URL" != *"$STAGING_REF"* ]]; then
  echo "[commerce-staging] BLOCKED: destination URL does not match .env.local staging ref." >&2
  exit 2
fi
if [[ ! -x "$PSQL_BIN" || ! -x "$PG_DUMP_BIN" ]]; then
  echo "[commerce-staging] PostgreSQL 17 psql/pg_dump tools are missing." >&2
  exit 2
fi

SOURCE_SCHEMA_OK="$("$PSQL_BIN" "$PRODUCTION_DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "SELECT (to_regclass('public.user_listings') IS NOT NULL AND to_regclass('public.commerce_packages') IS NOT NULL AND to_regprocedure('public.commerce_get_catalog()') IS NOT NULL)::text;")"
if [[ "$SOURCE_SCHEMA_OK" != "true" && "$SOURCE_SCHEMA_OK" != "t" ]]; then
  echo "[commerce-staging] BLOCKED: source database does not contain the verified production Commerce schema." >&2
  exit 2
fi

DEST_CLONED_OBJECTS="$("$PSQL_BIN" "$STAGING_DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'commerce_%') + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('_invoke_nurture_drip','commerce_get_catalog','commerce_create_order')); ")"
if [[ "$DEST_CLONED_OBJECTS" != "0" ]]; then
  if [[ "${COMMERCE_STAGING_RESET_PARTIAL:-false}" != "true" ]]; then
    echo "[commerce-staging] BLOCKED: staging contains a partial Commerce restore." >&2
    echo "[commerce-staging] Re-run with COMMERCE_STAGING_RESET_PARTIAL=true only for this disposable staging project." >&2
    exit 2
  fi
  read -r -p "Type RESET-${STAGING_REF} to drop only staging public schema: " RESET_CONFIRMATION
  if [[ "$RESET_CONFIRMATION" != "RESET-${STAGING_REF}" ]]; then
    echo "[commerce-staging] Reset confirmation did not match; no changes made." >&2
    exit 2
  fi
  echo "[commerce-staging] Resetting partial public schema on staging only..."
  "$PSQL_BIN" "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
fi

echo "[commerce-staging] Source schema guard PASS; staging destination is empty."
echo "[commerce-staging] Preparing staging extensions required by production schema..."
"$PSQL_BIN" "$STAGING_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
DO $extensions$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
    WHERE e.extname='unaccent' AND n.nspname <> 'public'
  ) THEN
    ALTER EXTENSION unaccent SET SCHEMA public;
  ELSIF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'unaccent') THEN
    CREATE EXTENSION unaccent WITH SCHEMA public;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
    WHERE e.extname='pg_trgm' AND n.nspname <> 'public'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA public;
  ELSIF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE EXTENSION pg_trgm WITH SCHEMA public;
  END IF;
END
$extensions$;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SQL

echo "[commerce-staging] Extension preparation PASS."

rm -f "$DUMP_FILE"
echo "[commerce-staging] Exporting public schema only from production..."
"$PG_DUMP_BIN" "$PRODUCTION_DATABASE_URL" \
  --schema-only \
  --schema=public \
  --no-owner \
  --file="$DUMP_FILE"

node scripts/assert-schema-only-dump.cjs "$DUMP_FILE"
node scripts/prepare-staging-schema-dump.cjs "$DUMP_FILE"

printf '[commerce-staging] Schema-only dump ready: %s\n' "$DUMP_FILE"
printf '[commerce-staging] Applying schema to staging ref: %s\n' "$STAGING_REF"
RESTORE_LOG="${HOME}/commerce-staging-restore.log"
echo "[commerce-staging] Restore runs in one transaction. It may take several minutes; do not press Ctrl+C."
if ! "$PSQL_BIN" "$STAGING_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$DUMP_FILE" >"$RESTORE_LOG" 2>&1; then
  echo "[commerce-staging] Restore failed and transaction was rolled back. Last log lines:" >&2
  tail -40 "$RESTORE_LOG" >&2
  exit 1
fi
echo "[commerce-staging] PASS: public schema restored to staging without row data."
echo "[commerce-staging] Restore log: $RESTORE_LOG"
