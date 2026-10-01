#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

read -r -p "Staging test email: " TEST_EMAIL
read -r -s -p "Staging test password (12+ chars): " TEST_PASSWORD
printf '\n'
read -r -s -p "Staging service-role key: " STAGING_SERVICE_ROLE_KEY
printf '\n'

COMMERCE_STAGING_TEST_EMAIL="$TEST_EMAIL" \
COMMERCE_STAGING_TEST_PASSWORD="$TEST_PASSWORD" \
COMMERCE_STAGING_SERVICE_ROLE_KEY="$STAGING_SERVICE_ROLE_KEY" \
node scripts/create-commerce-staging-user.cjs

unset TEST_EMAIL TEST_PASSWORD STAGING_SERVICE_ROLE_KEY
