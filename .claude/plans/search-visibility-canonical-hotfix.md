# Search Visibility Canonical URL Hotfix Plan

## Confirmed failure

Production has passed owner-MFA authentication and source loading, then fails when writing `search_visibility_urls`:

```
search_visibility_url_absolute_canonical
canonical_url ~ '^https://chonhaviet\\.com/[A-Za-z0-9/_-]*$'
```

The current candidate builder derives `canonical_url` using the environment-sensitive `absoluteUrl()`. `getSiteUrl()` allows `SITE_URL`, `NEXT_PUBLIC_SITE_URL`, or `VERCEL_PROJECT_PRODUCTION_URL`, so a Vercel deployment can produce a preview/Vercel-domain URL even though the private audit table correctly permits only canonical `https://chonhaviet.com/...` URLs. A valid public origin was confirmed from the live site, but the running server's environment value was not independently constrained by the audit code.

This is neither a missing migration, owner-MFA issue, nor Google API behavior.

## Implementation

1. **Make Search Visibility origin deterministic**
   - Add a Search Visibility-specific canonical URL helper using the approved public origin `https://chonhaviet.com`, matching the existing database constraint and non-www canonical-domain policy.
   - It will accept only a valid canonical path (single leading slash, allowed path characters, no query/fragment/double slash) and construct the absolute URL from that exact origin.
   - Do not alter global `getSiteUrl()`, public rendering, sitemap, robots, metadata, or environment configuration as part of this hotfix.

2. **Add server-side preflight validation before writes**
   - Validate every candidate immediately before the audit upsert:
     - `source_key` matches the database shape;
     - eligible candidates have an allowed canonical path and exact canonical URL on `https://chonhaviet.com`;
     - excluded candidates never carry an invalid URL/path.
   - If any item fails, do not call Supabase upsert. Fail the run with a bounded, owner-safe diagnostic including count and affected source keys/reason—not a raw, ambiguous constraint failure.
   - Keep the database CHECK constraint as the final defense; application validation is additive, not a replacement.

3. **Harden write/run error handling**
   - Wrap source loading, candidate construction, row validation, registry upsert, and run finalization in clear error boundaries.
   - Preserve the current failed-run audit record even if recording the failure itself encounters a secondary error; log the secondary server error without masking the primary failure.
   - Convert known persistence errors (especially canonical constraint/duplicate canonical/source key failures) to specific, actionable owner-facing messages. Unknown database errors remain generic rather than exposing sensitive internals.
   - Return structured error codes from the admin API so the UI can display the correct remediation instead of appending a generic migration/schema sentence.

4. **Improve the Admin UI error state**
   - Distinguish source read/schema failures, canonical policy failures, registry write failures, authentication failures, and unavailable audit tables.
   - State explicitly that a canonical-policy failure is blocked before storing URL audit data and never triggers a Google API call.
   - Do not add a URL input, manual override, or any action that sends URLs to Google.

5. **Tests and production-safe diagnostics**
   - Add unit tests for all generated eligible URL entity types to prove absolute URLs always use `https://chonhaviet.com` even when runtime site environment is a Vercel/preview domain.
   - Test rejection of malformed paths/absolute URL mismatch and assert that validation prevents the upsert call.
   - Test mapping of a simulated PostgREST canonical CHECK violation to a bounded, actionable API/UI error.
   - Keep/extend the existing source-schema regression tests for `areas` and `neighborhoods` without `updated_at`.
   - Add a user-run, read-only SQL diagnostic script that reports the production CHECK constraint definition and latest failed `search_visibility_runs` records. It performs no writes and does not call Google. No production migration should be needed for this code fix.

## Verification before commit/push request

1. Focused Search Visibility service, candidate, and route tests.
2. Full Vitest suite, TypeScript check, production build, and `git diff --check`.
3. `graphify update .` after changes.
4. Real Chrome check against the local production build on a public route at mobile width; document known local-only Vercel Insights 404s if present.
5. Trigger the API route in a controlled mocked/integration scenario to confirm malformed canonicals fail before upsert and valid candidates reach the upsert with exact canonical origin.
6. Record the mandatory verify-gate receipt.
7. Review and stage only the Search Visibility hotfix files; retain all unrelated workspace changes untouched.
8. Commit only after verification. Ask separately for push permission; never push on the earlier permission.

## Post-deploy validation

After deployment, the user retries **Admin → SEO/GEO → Search Visibility → Đồng bộ điều kiện URL**. Confirm the registry is populated and that any intentional exclusions use expected reason codes. Only after this succeeds should Search Console sitemap/inspection work be considered; no Google action is included here.
