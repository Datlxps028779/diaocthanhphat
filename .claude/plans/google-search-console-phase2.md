# Search Console Phase 2 — Sitemap Submission and Bounded URL Inspection

> **Current status — 2026-09-12:** server-only client, owner-MFA route actions,
> bounded inspection rules, persistence, and admin UI are implemented and covered
> by focused tests. Production owner actions have been exercised and verified:
> sitemap submit succeeded with internal DB reconciliation (`175/175` eligible
> rows submitted), and one bounded inspection batch succeeded `5/5/5/0`.
> Inspection evidence showed 2 URLs PASS/indexed and 3 URLs discovered but not yet
> indexed. No indexing guarantee is made. The admin card distinguishes
> `configured but not verified` from `ready` and requires exact URL-prefix property
> confirmation before Google actions.


## Goal

Use the already-verified private Search Visibility registry to perform two owner-triggered Google Search Console operations safely:

1. idempotently register/update the canonical sitemap in Search Console;
2. inspect a small, deterministic batch of eligible URLs and store Google’s returned index-status evidence.

This does not use the Google Indexing API, does not promise indexing, and does not run a scheduler.

## External prerequisites owned by the user

- A Google Cloud service account or OAuth-capable credential with access granted in Google Search Console to the exact property.
- Search Console property: `https://chonhaviet.com/` (or the exact verified property selected by the owner).
- OAuth scope: `https://www.googleapis.com/auth/webmasters` or read-only for inspection; sitemap submission needs the webmasters scope.
- Vercel server-only environment variables:
  - `GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL`
  - `GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY` (escaped newlines supported)
  - `GOOGLE_SEARCH_CONSOLE_SITE_URL`
  - `GOOGLE_SEARCH_CONSOLE_SITEMAP_URL`
- No secret is stored in browser code, database rows, SQL, logs, or admin UI.

## Implementation

### 1. Server-only Google client

Create a Node-only module that:

- validates required configuration and canonical site/sitemap origins;
- creates a short-lived service-account JWT with Node `crypto`;
- exchanges it at Google OAuth token endpoint;
- calls only the documented Search Console endpoints;
- never logs tokens, private keys, response credentials, or full sensitive request headers;
- normalizes Google errors into bounded internal error codes.

Endpoints:

- `PUT https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}` with no body;
- `POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect` with `{ inspectionUrl, siteUrl, languageCode: 'vi-VN' }`.

Use URL encoding for path segments and keep the site property/sitemap configuration separate from arbitrary browser input.

### 2. Search Visibility service actions

Extend the owner-only route with explicit actions, keeping the existing local eligibility sync unchanged:

- `sync` — existing local registry evaluation;
- `submit_sitemap` — submit only the fixed configured canonical sitemap, then update the eligible registry rows’ sitemap state/fingerprint and create a `sitemap_submit` run;
- `inspect_batch` — select at most five eligible rows in a deterministic order, skip recently inspected/queued rows, call URL Inspection sequentially, and persist only returned evidence/status fields; create an `inspection_batch` run.

Rules:

- No client-provided URL list or arbitrary URL.
- Reject if a registry URL is not exactly `https://chonhaviet.com/...` and does not match the configured site property.
- Never inspect excluded rows.
- Never claim “indexed” from a successful API response; expose Google’s actual verdict/coverage state and `evidence_observed_at` only.
- Keep retry/error counts bounded and preserve partial results if one URL fails.
- Use existing `search_visibility_urls` and `search_visibility_runs` columns; do not add production SQL unless schema verification proves a missing field.

### 3. Admin UI

Extend the existing Search Visibility card with:

- configuration state: `not configured`, `configured but not verified`, or `ready`;
- a clearly labeled `Gửi sitemap lên Search Console` button;
- a clearly labeled `Kiểm tra tối đa 5 URL trên Google` button;
- last sitemap submission result;
- last inspection batch result and evidence count;
- explicit copy that sitemap submission does not guarantee crawling/indexing and URL Inspection reports Google’s indexed version, not a live test.

Disable Google action buttons while loading/syncing and show specific setup/auth/quota/API errors without exposing secrets.

### 4. Tests

Add focused tests for:

- service-account token request/signing using mocked fetch and crypto boundary;
- exact sitemap endpoint/method and no request body;
- exact inspection request, maximum batch size, deterministic ordering, and excluded-row rejection;
- no arbitrary URL input accepted from the route;
- persistence of sitemap/inspection evidence and partial-failure accounting;
- route owner-MFA enforcement and structured error codes;
- UI/API copy never equating audit eligibility or API success with Google indexation.

## Verification and rollout

1. Run focused tests, full Vitest, typecheck, build, diff check, graphify update, and real Chrome public-route verification.
2. Record verify-gate receipt; owner admin UI remains unverified locally if no real owner-MFA session is available.
3. Commit only Phase 2 code/docs; do not include unrelated workspace files.
4. Ask separately before pushing.
5. After deployment, user configures Vercel secrets and grants the Search Console property; assistant does not handle or print secrets.
6. Owner submits the fixed sitemap and confirms the run/registry with `manual_search_console_sitemap_verify.sql`.
7. Owner runs the bounded inspection batch and confirms evidence with `manual_search_console_inspection_verify.sql`; report verdict/coverage counts without claiming indexing for all URLs.

## Deferred

- Scheduler/cron automation.
- Bulk URL inspection.
- Google Indexing API.
- Automatic “request indexing” actions.
- Any claim that Google accepted or indexed every sitemap URL.
