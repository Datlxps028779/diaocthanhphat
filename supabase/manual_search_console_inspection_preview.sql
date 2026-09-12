-- =============================================================================
-- Search Console URL Inspection preview — read-only
--
-- Shows the exact bounded candidate window the server will use for the next
-- owner-triggered inspection batch. It does not call Google, queue rows, write
-- inspection state, or change data/privileges.
--
-- The ordering and LIMIT 100 mirror inspectSearchVisibilityBatch(): priority
-- descending, least-recently inspected first, then source_key. Deferred rows are
-- filtered before the final five-row batch limit.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH candidate_window AS (
  SELECT
    sv.source_key,
    sv.entity_type,
    sv.canonical_url,
    sv.eligible,
    sv.inspection_status,
    sv.inspection_priority,
    sv.next_inspection_at,
    sv.last_inspected_at,
    sv.inspection_attempt_count
  FROM public.search_visibility_urls AS sv
  WHERE sv.eligible = true
  ORDER BY sv.inspection_priority DESC,
           sv.last_inspected_at ASC NULLS FIRST,
           sv.source_key ASC
  LIMIT 100
), candidates AS (
  SELECT *
  FROM candidate_window AS c
  WHERE c.canonical_url IS NOT NULL
    AND c.canonical_url ~ '^https://chonhaviet\.com/[A-Za-z0-9/_-]*$'
    AND (c.next_inspection_at IS NULL OR c.next_inspection_at <= now())
  ORDER BY c.inspection_priority DESC,
           c.last_inspected_at ASC NULLS FIRST,
           c.source_key ASC
  LIMIT 5
), registry_checks AS (
  SELECT
    count(*) FILTER (WHERE sv.eligible)::integer AS eligible_rows,
    count(*) FILTER (WHERE NOT sv.eligible AND sv.inspection_status = 'inspected')::integer AS excluded_rows_with_evidence,
    count(*) FILTER (
      WHERE sv.eligible
        AND sv.canonical_url IS NOT NULL
        AND sv.canonical_url !~ '^https://chonhaviet\.com/[A-Za-z0-9/_-]*$'
    )::integer AS eligible_malformed_urls,
    count(*) FILTER (WHERE sv.eligible AND sv.inspection_status = 'queued')::integer AS queued_rows,
    count(*) FILTER (WHERE sv.eligible AND sv.next_inspection_at > now())::integer AS deferred_rows
  FROM public.search_visibility_urls AS sv
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'batch_policy', jsonb_build_object(
    'candidate_window_limit', 100,
    'batch_limit', 5,
    'ordering', 'inspection_priority DESC, last_inspected_at ASC NULLS FIRST, source_key ASC',
    'google_call', false
  ),
  'registry_checks', (SELECT to_jsonb(r) FROM registry_checks AS r),
  'candidates', coalesce((
    SELECT jsonb_agg(to_jsonb(c) ORDER BY c.inspection_priority DESC, c.last_inspected_at ASC NULLS FIRST, c.source_key ASC)
    FROM candidates AS c
  ), '[]'::jsonb),
  'inspection_preview_ok',
    (SELECT eligible_malformed_urls = 0 FROM registry_checks)
    AND (SELECT excluded_rows_with_evidence = 0 FROM registry_checks)
    AND (SELECT count(*) BETWEEN 0 AND 5 FROM candidates),
  'interpretation', jsonb_build_object(
    'next_step', 'Owner may review these canonical URLs before separately authorizing the bounded inspection action.',
    'not_verified', 'Google indexing. This preview is local registry evidence only and makes no Google request.'
  )
) AS search_console_inspection_preview;

ROLLBACK;
