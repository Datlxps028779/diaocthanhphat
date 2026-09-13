# Search Console Sitemap Audit Persistence Hotfix

## Incident

Production accepted the canonical sitemap at Google, then failed while recording the internal `submitted` state:

> Google đã nhận sitemap nhưng không lưu được trạng thái audit nội bộ.

The external Google request therefore succeeded, but the Search Visibility audit run was marked failed because local persistence used an invalid upsert payload.

## Root cause

In `submitSearchVisibilitySitemap()` the service reads only:

- `source_key`
- `eligible`
- `canonical_url`

It then spreads those partial objects into `upsert(..., { onConflict: 'source_key' })` along with sitemap fields. `search_visibility_urls` has non-null columns such as `entity_type`, `reason_code`, and `source_version`. PostgreSQL checks the proposed insert row before conflict resolution, so the partial payload can fail required-column constraints even though an existing `source_key` row exists.

This is an implementation defect in the audit-persistence branch; it does not mean the sitemap was rejected, the Google credentials are wrong, or source URL slugs/canonicals are invalid.

## Fix

### 1. Change sitemap status persistence from partial upsert to scoped update

In `src/lib/server/searchVisibilityService.ts`:

- After Google accepts the sitemap, update existing audit rows using `UPDATE search_visibility_urls ... WHERE eligible = true`.
- Set only sitemap audit fields:
  - `sitemap_status = 'submitted'`;
  - `last_sitemap_submission_at`;
  - `sitemap_submission_fingerprint`;
  - `sitemap_error = null`;
  - `updated_at`.
- Do not reinsert candidate rows or rewrite canonical/source fields.
- Keep the preexisting eligibility sync as the only operation that creates/updates registry rows.
- Preserve run metadata stating Google acceptance is not an indexing guarantee.

This is safe because `eligible = true` rows are required by the schema to have canonical fields and have already passed the deterministic canonical policy during eligibility sync.

### 2. Improve error classification

- Include the sanitized persistence failure context in the owner-facing error only when it contains no secret/token data.
- Make the message accurately say Google accepted the sitemap but the internal audit update failed.
- Keep a structured `AUDIT_WRITE` code; no second Google API call happens after an audit write failure.

### 3. Regression tests

Add service-level tests using a small Supabase query-builder double to prove:

1. After a mocked successful sitemap API call, the persistence branch issues an `update(...).eq('eligible', true)` and does not call `upsert` for `search_visibility_urls`.
2. The update payload contains only sitemap audit fields and no partial candidate fields.
3. The sitemap run finalizes as succeeded after a successful audit update.
4. A local audit update error returns `AUDIT_WRITE`, records a failed run, and does not repeat the external Google submission.

Retain existing tests for cooldown and canonical candidate validation.

### 4. Validation and rollout

- Run focused Search Visibility service tests and existing Search Console/route tests.
- Run full Vitest, typecheck, production build, and `git diff --check`.
- Run `graphify update .` after code changes.
- Verify in real Chrome locally as far as owner-MFA allows; the authenticated production Google call cannot be replayed locally.
- Record the verify-gate receipt.
- Commit/push only the hotfix files after explicit approval.

## Operational follow-up

After deployment, use Search Visibility to refresh the audit and inspect the prior failed run. Do **not** resubmit the sitemap just to repair local state: the system's sitemap submission cooldown will prevent duplicate calls, and the incident already confirms Google accepted the existing request. If a refresh of audit state is required, it should be a local-only operation or a specifically designed reconciliation action, never an automatic external retry.
