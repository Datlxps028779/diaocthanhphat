-- =============================================================================
-- Search Console sitemap submission verification — read-only
--
-- Run after the owner submits the fixed canonical sitemap from the admin UI.
-- This verifies the internal audit run and registry state only; it does not call
-- Google, submit/re-submit a sitemap, inspect URLs, or change data/privileges.
--
-- Expected canonical values are deliberately fixed to the production property.
-- No service-account credential or access token is read by this query.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH expected AS (
  SELECT
    'https://chonhaviet.com/'::text AS site_url,
    'https://chonhaviet.com/sitemap.xml'::text AS sitemap_url
), latest_sitemap_run AS (
  SELECT
    r.id,
    r.run_type,
    r.status,
    r.request_fingerprint,
    r.requested_count,
    r.processed_count,
    r.succeeded_count,
    r.deferred_count,
    r.failed_count,
    r.error_summary,
    r.metadata,
    r.started_at,
    r.finished_at
  FROM public.search_visibility_runs AS r
  WHERE r.run_type = 'sitemap_submit'
  ORDER BY r.started_at DESC, r.id DESC
  LIMIT 1
), sitemap_registry AS (
  SELECT
    count(*) FILTER (WHERE sv.eligible)::integer AS eligible_rows,
    count(*) FILTER (
      WHERE sv.eligible AND sv.sitemap_status = 'submitted'
    )::integer AS submitted_rows,
    count(*) FILTER (
      WHERE sv.eligible AND sv.sitemap_status <> 'submitted'
    )::integer AS eligible_not_submitted_rows,
    count(*) FILTER (
      WHERE sv.eligible
        AND sv.sitemap_status = 'submitted'
        AND sv.last_sitemap_submission_at IS NULL
    )::integer AS submitted_missing_timestamp_rows,
    count(*) FILTER (
      WHERE sv.eligible
        AND sv.sitemap_status = 'submitted'
        AND sv.sitemap_submission_fingerprint IS NULL
    )::integer AS submitted_missing_fingerprint_rows,
    count(*) FILTER (
      WHERE sv.eligible AND sv.sitemap_status = 'error'
    )::integer AS eligible_error_rows,
    count(DISTINCT sv.sitemap_submission_fingerprint) FILTER (
      WHERE sv.eligible AND sv.sitemap_status = 'submitted'
    )::integer AS submitted_fingerprint_groups,
    max(sv.last_sitemap_submission_at) FILTER (
      WHERE sv.eligible AND sv.sitemap_status = 'submitted'
    ) AS latest_registry_submission_at
  FROM public.search_visibility_urls AS sv
), recent_sitemap_runs AS (
  SELECT
    r.id,
    r.status,
    r.requested_count,
    r.processed_count,
    r.succeeded_count,
    r.deferred_count,
    r.failed_count,
    r.request_fingerprint,
    r.error_summary,
    r.metadata,
    r.started_at,
    r.finished_at
  FROM public.search_visibility_runs AS r
  WHERE r.run_type = 'sitemap_submit'
  ORDER BY r.started_at DESC, r.id DESC
  LIMIT 5
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'environment', jsonb_build_object(
    'search_visibility_urls', to_regclass('public.search_visibility_urls') IS NOT NULL,
    'search_visibility_runs', to_regclass('public.search_visibility_runs') IS NOT NULL
  ),
  'expected', (SELECT to_jsonb(e) FROM expected AS e),
  'latest_sitemap_run', coalesce((
    SELECT to_jsonb(r)
    FROM latest_sitemap_run AS r
  ), '{}'::jsonb),
  'registry', (SELECT to_jsonb(s) FROM sitemap_registry AS s),
  'recent_sitemap_runs', coalesce((
    SELECT jsonb_agg(to_jsonb(r) ORDER BY r.started_at DESC, r.id DESC)
    FROM recent_sitemap_runs AS r
  ), '[]'::jsonb),
  'sitemap_submit_contract_ok',
    EXISTS (
      SELECT 1
      FROM latest_sitemap_run AS r
      CROSS JOIN expected AS e
      WHERE r.status = 'succeeded'
        AND r.requested_count = 1
        AND r.processed_count = 1
        AND r.succeeded_count = 1
        AND r.deferred_count = 0
        AND r.failed_count = 0
        AND r.finished_at IS NOT NULL
        AND r.request_fingerprint IS NOT NULL
        AND r.metadata ->> 'siteUrl' = e.site_url
        AND r.metadata ->> 'sitemapUrl' = e.sitemap_url
    )
    AND (SELECT eligible_rows > 0 FROM sitemap_registry)
    AND (SELECT eligible_not_submitted_rows = 0 FROM sitemap_registry)
    AND (SELECT submitted_missing_timestamp_rows = 0 FROM sitemap_registry)
    AND (SELECT submitted_missing_fingerprint_rows = 0 FROM sitemap_registry)
    AND (SELECT eligible_error_rows = 0 FROM sitemap_registry),
  'interpretation', jsonb_build_object(
    'verified', 'Internal sitemap_submit run and eligible registry state are consistent with the owner action.',
    'not_verified', 'Google crawling or indexing. This read-only query does not prove that any URL was crawled or indexed.'
  )
) AS search_console_sitemap_verification;

ROLLBACK;
