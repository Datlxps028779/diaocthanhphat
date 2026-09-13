# Horizon 4 — SEO/content consistency measurement

> Status: `IN PROGRESS` — measurement only; no production data mutation.
>
> Started: 2026-09-11.
>
> This batch is deliberately narrower than the older Search Visibility hotfix
> plans. Those hotfixes are already implemented in the current code history.
> This batch measures the remaining source/runtime consistency before deciding
> whether another code change is justified.

## Scope

1. News published URL source:
   - missing, malformed, or duplicate slugs;
   - structured location ID coverage and hierarchy mismatches;
   - stored `schema_markup` shape as informational evidence only.
2. News body internal links:
   - relative internal links;
   - absolute same-site links;
   - external links;
   - query/hash links that may weaken canonical consistency.
3. Search Visibility registry:
   - published News source-key coverage;
   - expected canonical URL/path consistency;
   - duplicate canonical evidence;
   - latest audit run status.
4. Runtime verification still required separately:
   - generated `/sitemap.xml` URL inventory, origin, duplicate/query/hash checks;
   - rendered canonical and JSON-LD on representative public routes;
   - one News desktop/mobile route check with no duplicate rail or broken links.

## Safety boundary

- `supabase/manual_horizon4_seo_content_consistency_dry_run.sql` is read-only.
- `supabase/manual_horizon4_seo_content_consistency_summary.sql` is a one-row read-only fallback when the SQL editor only exposes the final result set.
- It does not call Google, submit a sitemap, update Search Visibility, or alter
  News content.
- Existing News articles remain unchanged; no bulk rewrite/backfill is part of
  this batch.
- Production SQL is run by the user. After the user reports the result, compare
  it with browser/runtime evidence before changing source.

## Initial production measurement — 2026-09-11

The first one-row summary reported:

- 79 published News rows; 0 duplicate slug groups; 1 malformed slug under the original broad SQL pattern; the exact row still needs a rerun with the stricter application-compatible lowercase pattern.
- Structured location: 18 area IDs, 0 district IDs, 0 ward IDs, 0 neighborhood IDs; 0 hierarchy issue rows.
- Stored schema markup: 75 JSON objects, 4 null, 0 non-object. This is informational; public JSON-LD must still be verified in Chrome.
- Internal-link proxy: 38 published rows below 2 relative links; 5 rows contain external HTTP(S) links; 0 query/hash relative links; 0 absolute-same-site-only risk.
- Search Visibility registry: 78 valid published News rows checked, 0 missing rows, 0 canonical URL mismatches, 0 canonical path mismatches, 0 published-not-eligible rows; duplicate canonical URL result is empty.
- Audit runs: latest eligibility sync succeeded on 2026-09-11; latest sitemap submit succeeded on 2026-09-09; historical failures are from 2026-08-22.

Interpretation: no current registry or taxonomy integrity failure is demonstrated. The 1 malformed published slug and the 38 internal-link deficits are data/readiness findings, not grounds for bulk rewrite. The measurement did reveal a code-consistency gap: the sitemap previously fell back to a raw slug/ID for published News, while Search Visibility excluded missing/malformed slugs. The local fix now shares `isValidSlug()` between sitemap and Search Visibility and skips invalid News URLs instead of emitting a URL the audit does not consider canonical. The stricter summary identified the malformed production row as News `f551d52c-3927-4d02-83a0-8cdb5996d365`, whose slug ends with a trailing hyphen. It remains unchanged for later manual editorial repair; the sitemap fix prevents that non-canonical source slug from being emitted meanwhile.

### Local implementation started — 2026-09-11

- [x] Add shared `isValidSlug()` predicate in `src/lib/slug.ts`.
- [x] Use it in Search Visibility and `app/sitemap.ts`.
- [x] Stop sitemap fallback to raw slug/News ID for missing or malformed News slugs.
- [x] Add focused slug regression tests.
- [x] Focused tests: 3 files, 28 tests passed.
- [x] Run full typecheck, Vitest, and production build; Chrome runtime verification remains pending due local port sandbox restriction.
- [x] Updated one-row SQL summary identified the exact malformed row; no automatic mutation was performed.
- [x] Full Vitest: 192 files / 1496 tests passed.
- [x] Typecheck passed after the production build regenerated `.next/types`.
- [x] Production build completed; sandbox DNS could not resolve Supabase during static data fetches, but the build used existing empty-safe fallbacks and exited successfully.
- [x] Chrome thật mở `http://localhost:3000/sitemap.xml` sau production build: XML render thành công, 178 URL quan sát được, origin canonical `https://chonhaviet.com`; không thấy `vercel.app`.
- [ ] Production Chrome verification after deploy is still required; admin/MFA and Search Console were not exercised in this local read-only check.


### Final production follow-up — 2026-09-13

- [x] Owner-MFA server boundary corrected News `f551d52c-3927-4d02-83a0-8cdb5996d365` to the canonical lowercase slug; the article remained published.
- [x] Search Visibility was synced once after the correction. The target registry row is now `eligible = true`, `reason_code = ELIGIBLE`, with the expected canonical URL/path.
- [x] All-News read-only audit measured 80 rows: `valid_rows = 80`, `missing_rows = 0`, `malformed_rows = 0`, `invalid_published_rows = 0`, and `constraint_blocking_published_rows = 0`.
- [x] `public.news_slug_format` was validated successfully at `2026-09-13T06:10:23.885474+00:00`.
- [x] Product hardening is deployed from commit `37e8838077bcf1fee6378b8d1503cdfd8e1316b8` on `origin/main`.
- [ ] Record the final Chrome check for the new public URL and the old trailing-hyphen URL if that runtime evidence is still needed.

This closes the measured News slug/source/registry/constraint slice. It does not claim Google crawl/index evidence and does not authorize bulk content rewrite.

## Acceptance criteria before implementation

- [ ] User-run SQL result captured and reviewed.
- [ ] Any issue is classified as source-data, registry/audit, render/runtime, or
      actual code defect; do not mix these categories.
- [ ] No new migration is proposed unless the measurement proves a schema gap.
- [ ] If code change is justified: focused tests, full Vitest, typecheck, build,
      `git diff --check`, `graphify update .`, and real Chrome verification.
- [ ] Technical/logic audit is completed after the batch, before the single
      combined commit/push requested by the user.

## Explicitly not in this batch

- No manual repair of existing News rows.
- No keyword-based property recommendations from free-form GEO text.
- No Google Search Console API call or indexation conclusion.
- No sitemap shard migration; current inventory is far below the hard cap.
- No push until the user separately authorizes the final combined push.

## Direction correction — 2026-09-13

The A2 corpus measurement is complete. Its `75/80 published_would_fail` result is
legacy republish-readiness evidence, not a request to rewrite live News rows.
The scope is reset to infrastructure stability and small technical defects before
any later integration work:

- [News publication quality prevention TODO](news-publication-quality-prevention-todo.md)

Until that TODO is complete, do not bulk-edit News content, change quality
thresholds, add a migration, or run another corpus mutation.
