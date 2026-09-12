-- =============================================================================
-- Search + Search Visibility P2 — lifecycle/freshness measurement, read-only
--
-- Run after a controlled production create/update/publish/unpublish/delete action
-- to measure whether the public propagation contract produced freshness jobs and
-- a Search Visibility run. This query does not mutate data, claim jobs, call the
-- worker, revalidate paths, submit a sitemap, inspect URLs, or call Google.
--
-- The default window is the previous 24 hours. For a tighter measurement, replace
-- the interval in params with the UTC timestamp immediately before the controlled
-- action. The result is one JSON row so Supabase SQL Editor does not hide sections.
-- Event kinds/actions are the server-side propagation evidence; this query does
-- not infer Google indexing from a successful queue or Search Visibility run.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH params AS (
  SELECT
    now() - interval '24 hours' AS window_start,
    now() - interval '90 days' AS history_start
), freshness_status AS (
  SELECT
    j.status,
    count(*)::integer AS job_count,
    count(*) FILTER (WHERE j.processed_at IS NOT NULL)::integer AS processed_count,
    min(j.created_at) AS oldest_created_at,
    max(j.created_at) AS latest_created_at,
    max(j.processed_at) AS latest_processed_at
  FROM public.seo_freshness_jobs AS j
  CROSS JOIN params
  WHERE j.created_at >= params.window_start
  GROUP BY j.status
), freshness_event AS (
  SELECT
    j.event_kind,
    j.event_action,
    count(*)::integer AS job_count,
    count(*) FILTER (WHERE j.status = 'succeeded')::integer AS succeeded_count,
    count(*) FILTER (WHERE j.status IN ('pending', 'processing', 'failed', 'dead_letter'))::integer AS open_or_failed_count,
    max(j.created_at) AS latest_created_at,
    max(j.processed_at) AS latest_processed_at
  FROM public.seo_freshness_jobs AS j
  CROSS JOIN params
  WHERE j.created_at >= params.window_start
  GROUP BY j.event_kind, j.event_action
), lifecycle_coverage AS (
  SELECT
    action.event_action,
    EXISTS (
      SELECT 1
      FROM public.seo_freshness_jobs AS j
      CROSS JOIN params
      WHERE j.created_at >= params.window_start
        AND j.event_action = action.event_action
    ) AS observed
  FROM (VALUES ('create'), ('update'), ('publish'), ('unpublish'), ('delete')) AS action(event_action)
), historical_lifecycle_coverage AS (
  SELECT
    action.event_action,
    count(j.id)::integer AS job_count,
    count(j.id) FILTER (WHERE j.status = 'succeeded')::integer AS succeeded_count,
    count(j.id) FILTER (WHERE j.status IN ('pending', 'processing', 'failed', 'dead_letter'))::integer AS open_or_failed_count,
    max(j.created_at) AS latest_created_at,
    max(j.processed_at) AS latest_processed_at
  FROM (VALUES ('create'), ('update'), ('publish'), ('unpublish'), ('delete')) AS action(event_action)
  LEFT JOIN public.seo_freshness_jobs AS j
    ON j.event_action = action.event_action
   AND j.created_at >= (SELECT history_start FROM params)
  GROUP BY action.event_action
), freshness_integrity AS (
  SELECT
    count(*) FILTER (
      WHERE j.status = 'processing'
        AND (j.locked_at IS NULL OR j.locked_by IS NULL)
    )::integer AS processing_lock_shape_errors,
    count(*) FILTER (
      WHERE j.status <> 'processing'
        AND (j.locked_at IS NOT NULL OR j.locked_by IS NOT NULL)
    )::integer AS non_processing_lock_leaks,
    count(*) FILTER (
      WHERE j.status IN ('pending', 'failed')
        AND j.next_attempt_at <= now()
        AND j.attempt_count < j.max_attempts
    )::integer AS due_retryable_jobs,
    count(*) FILTER (WHERE j.status = 'dead_letter')::integer AS dead_letter_jobs,
    count(*) FILTER (
      WHERE j.status = 'processing'
        AND j.locked_at < now() - interval '10 minutes'
    )::integer AS stale_processing_locks
  FROM public.seo_freshness_jobs AS j
  CROSS JOIN params
  WHERE j.created_at >= params.window_start
), recent_freshness AS (
  SELECT
    j.id,
    j.event_kind,
    j.event_action,
    j.path,
    j.status,
    j.attempt_count,
    j.max_attempts,
    j.next_attempt_at,
    j.last_error,
    j.created_at,
    j.processed_at
  FROM public.seo_freshness_jobs AS j
  CROSS JOIN params
  WHERE j.created_at >= params.window_start
  ORDER BY j.created_at DESC, j.id DESC
  LIMIT 50
), visibility_runs AS (
  SELECT
    r.id,
    r.run_type,
    r.status,
    r.requested_count,
    r.processed_count,
    r.succeeded_count,
    r.deferred_count,
    r.failed_count,
    r.started_at,
    r.finished_at,
    r.error_summary
  FROM public.search_visibility_runs AS r
  CROSS JOIN params
  WHERE r.started_at >= params.window_start
  ORDER BY r.started_at DESC, r.id DESC
  LIMIT 25
), latest_successful_sync AS (
  SELECT
    r.id,
    r.started_at,
    r.finished_at,
    r.requested_count,
    r.processed_count,
    r.succeeded_count,
    r.failed_count,
    r.deferred_count
  FROM public.search_visibility_runs AS r
  WHERE r.run_type = 'eligibility_sync'
    AND r.status = 'succeeded'
  ORDER BY r.finished_at DESC NULLS LAST, r.started_at DESC, r.id DESC
  LIMIT 1
), registry_state AS (
  SELECT
    count(*)::integer AS total_rows,
    count(*) FILTER (WHERE eligible)::integer AS eligible_rows,
    count(*) FILTER (WHERE NOT eligible)::integer AS excluded_rows,
    count(*) FILTER (WHERE eligible AND sitemap_status = 'submitted')::integer AS sitemap_submitted_rows,
    count(*) FILTER (WHERE eligible AND inspection_status = 'inspected')::integer AS inspected_rows,
    count(*) FILTER (WHERE eligible AND inspection_status IN ('error', 'deferred'))::integer AS inspection_attention_rows,
    max(updated_at) AS latest_registry_update
  FROM public.search_visibility_urls
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'measurement_window', jsonb_build_object(
    'window_start', (SELECT window_start FROM params),
    'window_end', now(),
    'note', 'Đây là evidence propagation nội bộ; không phải bằng chứng Google đã index URL.'
  ),
  'environment', jsonb_build_object(
    'seo_freshness_jobs', to_regclass('public.seo_freshness_jobs') IS NOT NULL,
    'search_visibility_urls', to_regclass('public.search_visibility_urls') IS NOT NULL,
    'search_visibility_runs', to_regclass('public.search_visibility_runs') IS NOT NULL
  ),
  'freshness', jsonb_build_object(
    'by_status', coalesce((
      SELECT jsonb_object_agg(s.status, to_jsonb(s) - 'status')
      FROM freshness_status AS s
    ), '{}'::jsonb),
    'by_event', coalesce((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.event_kind, e.event_action)
      FROM freshness_event AS e
    ), '[]'::jsonb),
    'lifecycle_coverage', coalesce((
      SELECT jsonb_object_agg(c.event_action, c.observed ORDER BY c.event_action)
      FROM lifecycle_coverage AS c
    ), '{}'::jsonb),
    'historical_lifecycle_coverage_90d', coalesce((
      SELECT jsonb_agg(to_jsonb(h) ORDER BY h.event_action)
      FROM historical_lifecycle_coverage AS h
    ), '[]'::jsonb),
    'integrity', (SELECT to_jsonb(i) FROM freshness_integrity AS i),
    'recent_jobs', coalesce((
      SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at DESC, f.id DESC)
      FROM recent_freshness AS f
    ), '[]'::jsonb)
  ),
  'search_visibility', jsonb_build_object(
    'runs_in_window', coalesce((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY v.started_at DESC, v.id DESC)
      FROM visibility_runs AS v
    ), '[]'::jsonb),
    'latest_successful_sync', coalesce((
      SELECT to_jsonb(s)
      FROM latest_successful_sync AS s
    ), '{}'::jsonb),
    'registry_state', (SELECT to_jsonb(s) FROM registry_state AS s)
  ),
  'measurement_interpretation', jsonb_build_object(
    'history_window_start', (SELECT history_start FROM params),
    'observed_lifecycle_actions', coalesce((
      SELECT jsonb_agg(c.event_action ORDER BY c.event_action)
      FROM lifecycle_coverage AS c
      WHERE c.observed
    ), '[]'::jsonb),
    'unobserved_lifecycle_actions', coalesce((
      SELECT jsonb_agg(c.event_action ORDER BY c.event_action)
      FROM lifecycle_coverage AS c
      WHERE NOT c.observed
    ), '[]'::jsonb),
    'historical_observed_lifecycle_actions', coalesce((
      SELECT jsonb_agg(h.event_action ORDER BY h.event_action)
      FROM historical_lifecycle_coverage AS h
      WHERE h.job_count > 0
        AND h.open_or_failed_count = 0
    ), '[]'::jsonb),
    'historical_unobserved_lifecycle_actions', coalesce((
      SELECT jsonb_agg(h.event_action ORDER BY h.event_action)
      FROM historical_lifecycle_coverage AS h
      WHERE h.job_count = 0
    ), '[]'::jsonb),
    'historical_lifecycle_evidence_complete', (
      SELECT count(*) = 5
        AND count(*) FILTER (WHERE job_count > 0 AND open_or_failed_count = 0) = 5
      FROM historical_lifecycle_coverage
    ),
    'expected_after_public_mutation', 'Có freshness jobs cho event_kind/action tương ứng, trạng thái succeeded sau khi worker xử lý, và một eligibility_sync succeeded nếu mutation có public impact.',
    'does_not_prove', 'Sitemap được Google crawl hay URL đã được index. Hai việc đó chỉ có evidence từ Search Console owner action/URL Inspection.'
  )
) AS p2_freshness_lifecycle_measurement;

ROLLBACK;
