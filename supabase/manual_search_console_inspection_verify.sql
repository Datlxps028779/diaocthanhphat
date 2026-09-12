-- =============================================================================
-- Search Console URL Inspection verification — read-only
--
-- Run after the owner completes one bounded inspection batch from the admin UI.
-- This verifies internal run counters and persisted Google evidence only. It does
-- not call Google, inspect another URL, retry a batch, or change data/privileges.
--
-- A Google response is evidence about Google's indexed version. It is not proof
-- that the live URL passed a real-time crawl or that Google indexed the URL.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH latest_inspection_run AS (
  SELECT
    r.id,
    r.run_type,
    r.status,
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
  WHERE r.run_type = 'inspection_batch'
  ORDER BY r.started_at DESC, r.id DESC
  LIMIT 1
), inspected_in_run AS (
  SELECT
    sv.source_key,
    sv.entity_type,
    sv.canonical_url,
    sv.inspection_status,
    sv.google_verdict,
    sv.google_coverage_state,
    sv.google_canonical,
    sv.user_canonical,
    sv.google_robots_state,
    sv.google_last_crawl_at,
    sv.evidence_observed_at,
    sv.last_inspected_at,
    sv.inspection_error
  FROM public.search_visibility_urls AS sv
  CROSS JOIN latest_inspection_run AS r
  WHERE sv.eligible = true
    AND sv.last_inspected_at IS NOT NULL
    AND sv.last_inspected_at >= r.started_at
    AND (r.finished_at IS NULL OR sv.last_inspected_at <= r.finished_at)
  ORDER BY sv.last_inspected_at DESC, sv.source_key ASC
), coverage_summary AS (
  SELECT
    coalesce(i.google_verdict, 'NULL') AS google_verdict,
    coalesce(i.google_coverage_state, 'NULL') AS google_coverage_state,
    count(*)::integer AS row_count
  FROM inspected_in_run AS i
  GROUP BY i.google_verdict, i.google_coverage_state
), global_checks AS (
  SELECT
    count(*) FILTER (WHERE NOT sv.eligible AND sv.inspection_status = 'inspected')::integer AS excluded_rows_inspected,
    count(*) FILTER (
      WHERE sv.inspection_status = 'inspected'
        AND (sv.evidence_observed_at IS NULL OR sv.google_verdict IS NULL AND sv.google_coverage_state IS NULL)
    )::integer AS inspected_rows_missing_evidence,
    count(*) FILTER (
      WHERE sv.eligible
        AND sv.inspection_status = 'inspected'
        AND (sv.canonical_url IS NULL OR sv.canonical_url !~ '^https://chonhaviet\.com/[A-Za-z0-9/_-]*$')
    )::integer AS inspected_rows_malformed_canonical
  FROM public.search_visibility_urls AS sv
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'latest_inspection_run', coalesce((
    SELECT to_jsonb(r) FROM latest_inspection_run AS r
  ), '{}'::jsonb),
  'run_evidence_rows', coalesce((
    SELECT jsonb_agg(to_jsonb(i) ORDER BY i.last_inspected_at DESC, i.source_key ASC)
    FROM inspected_in_run AS i
  ), '[]'::jsonb),
  'run_evidence_count', (SELECT count(*)::integer FROM inspected_in_run),
  'coverage_summary', coalesce((
    SELECT jsonb_agg(to_jsonb(c) ORDER BY c.google_verdict, c.google_coverage_state)
    FROM coverage_summary AS c
  ), '[]'::jsonb),
  'global_checks', (SELECT to_jsonb(c) FROM global_checks AS c),
  'inspection_contract_ok', EXISTS (
      SELECT 1
      FROM latest_inspection_run AS r
      WHERE r.status IN ('succeeded', 'partial', 'failed')
        AND r.requested_count BETWEEN 0 AND 5
        AND r.processed_count BETWEEN 0 AND r.requested_count
        AND r.succeeded_count + r.failed_count = r.processed_count
        AND (SELECT count(*) FROM inspected_in_run) = r.succeeded_count
        AND r.finished_at IS NOT NULL
    )
    AND (SELECT excluded_rows_inspected = 0 FROM global_checks)
    AND (SELECT inspected_rows_missing_evidence = 0 FROM global_checks)
    AND (SELECT inspected_rows_malformed_canonical = 0 FROM global_checks),
  'interpretation', jsonb_build_object(
    'verified', 'Internal inspection_batch counters and persisted evidence shape.',
    'not_verified', 'Google indexing or live crawl success; inspect verdict and coverage fields individually.'
  )
) AS search_console_inspection_verification;

ROLLBACK;
