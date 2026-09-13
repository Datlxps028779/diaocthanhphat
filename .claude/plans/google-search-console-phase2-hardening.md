# Search Console Phase 2 — Operational Hardening

## Objective

Tighten the Phase 2 Search Console workflow before credentials are configured or any real Google request occurs. The changes keep its bounded, owner-triggered model and address three operational gaps found in the first implementation.

## Findings

1. The sitemap path sent to Google is pinned to `https://chonhaviet.com/sitemap.xml`, but the Next sitemap generator still derives its URL origin through `getSiteUrl()`. The sitemap must itself be guaranteed to emit canonical production URLs whenever it is the sitemap submitted to Search Console.
2. Inspection selection orders by `last_inspected_at` but does not filter rows whose `next_inspection_at` is still in the future. A URL deferred after an error can therefore be selected too soon.
3. The inspection selection does not load `inspection_attempt_count`, so persisted attempts can be overwritten as `1` instead of incrementing across batches.
4. Sitemap API submission is idempotent, but a UI owner can still repeatedly submit an unchanged sitemap. A server-side cooldown should prevent redundant external calls while preserving a clear audit state.

## Changes

### 1. Canonical sitemap origin

- Pin the server sitemap output to `https://chonhaviet.com` using the Search Visibility canonical-origin policy, rather than deployment/preview origin selection.
- Preserve existing URL paths, quality gates, and `lastModified` behavior.
- Add sitemap-focused tests proving every emitted URL has the canonical origin and preview origin is never emitted.

### 2. Sitemap cooldown

- Add a `SEARCH_VISIBILITY_SITEMAP_COOLDOWN_MS` constant (24 hours).
- Before creating a Google call, read the latest successful `sitemap_submit` run for the same sitemap fingerprint.
- If it is inside the cooldown, create no Google call and return a structured `GOOGLE_DEFERRED` error/message containing the next eligible time.
- A changed site/sitemap fingerprint bypasses the cooldown.
- The admin UI shows the deferred state as intentional: “already submitted recently”, not as a failure or indexing status.

### 3. Bounded inspection selection

- Include `inspection_attempt_count` in selection.
- Select only canonical, eligible rows whose `next_inspection_at` is null or in the past; enforce this defensively in server code even if the database query is broad.
- Retain deterministic ordering: priority descending, oldest/no `last_inspected_at` first, then source key as a stable tie-breaker.
- Keep batch size at five and sequential requests.
- Increment persisted attempt count correctly on both success and error.
- If no URL is eligible now, create a successful zero-work audit run with a deferred-count/metadata explanation; do not call Google.

### 4. Error/UI/API typing

- Add `GOOGLE_DEFERRED` to server/client error types.
- Keep all existing failure semantics and never expose secret material.
- Refine UI language so cooldown and scheduled retry are clearly non-errors.

### 5. Tests and validation

Add focused tests for:

- canonical sitemap output;
- unchanged sitemap cooldown makes zero Google requests;
- changed fingerprint bypasses cooldown;
- future `next_inspection_at` rows are skipped;
- attempt counts increment from their existing values;
- stable ordering and zero-work inspection batch;
- route returns structured deferred code.

Then run focused tests, full Vitest, typecheck, production build, diff check, Graphify update, real-Chrome public sitemap/route verification, and record the verify-gate receipt. No Google secret will be added and no Google API call will be made during this work.

## Production / rollout

No schema change or production SQL is required. After deployment, the owner must configure the server-only secrets and grant the service account access to the exact Search Console property. The first user-triggered sitemap submission will be the first external Google operation; it should be separately authorized by the owner at that time.
