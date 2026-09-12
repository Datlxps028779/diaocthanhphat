-- =============================================================================
-- Search + Search Visibility P2 verification — read-only
--
-- Production SQL is run by the user. This query does not sync the registry,
-- submit a sitemap, inspect URLs, enqueue freshness work, or change data.
-- Run after the Search Visibility migrations are deployed.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH registry AS (
  SELECT
    sv.source_key,
    sv.entity_type,
    sv.canonical_url,
    sv.canonical_path,
    sv.eligible,
    sv.reason_code,
    sv.sitemap_status,
    sv.inspection_status,
    sv.evidence_observed_at,
    sv.evaluated_at,
    sv.updated_at
  FROM public.search_visibility_urls AS sv
), latest_successful_sync AS (
  SELECT started_at, finished_at, processed_count
  FROM public.search_visibility_runs
  WHERE run_type = 'eligibility_sync'
    AND status = 'succeeded'
  ORDER BY finished_at DESC NULLS LAST, started_at DESC
  LIMIT 1
), registry_checks AS (
  SELECT
    count(*)::integer AS total_rows,
    count(*) FILTER (WHERE eligible)::integer AS eligible_rows,
    count(*) FILTER (WHERE NOT eligible)::integer AS excluded_rows,
    count(*) FILTER (
      WHERE eligible
        AND (canonical_url IS NULL OR canonical_path IS NULL)
    )::integer AS eligible_missing_canonical,
    count(*) FILTER (
      WHERE canonical_path IS NOT NULL
        AND (canonical_path ~ '[?#]' OR canonical_path ~ '//' OR canonical_path !~ '^/[A-Za-z0-9/_-]*$')
    )::integer AS malformed_canonical_paths,
    count(*) FILTER (
      WHERE canonical_url IS NOT NULL
        AND canonical_url !~ '^https://chonhaviet\.com/[A-Za-z0-9/_-]*$'
    )::integer AS malformed_canonical_urls,
    count(*) FILTER (WHERE eligible AND sitemap_status = 'submitted')::integer AS sitemap_submitted_rows,
    count(*) FILTER (WHERE eligible AND evidence_observed_at IS NOT NULL)::integer AS google_evidence_rows,
    count(*) FILTER (
      WHERE latest.started_at IS NOT NULL
        AND evaluated_at < latest.started_at
    )::integer AS rows_behind_latest_successful_sync
  FROM registry
  LEFT JOIN latest_successful_sync AS latest ON true
), duplicate_source_keys AS (
  SELECT count(*)::integer AS duplicate_groups
  FROM (
    SELECT source_key
    FROM registry
    GROUP BY source_key
    HAVING count(*) > 1
  ) AS duplicates
), duplicate_canonical_urls AS (
  SELECT count(*)::integer AS duplicate_groups
  FROM (
    SELECT canonical_url
    FROM registry
    WHERE canonical_url IS NOT NULL
    GROUP BY canonical_url
    HAVING count(*) > 1
  ) AS duplicates
), by_entity AS (
  SELECT entity_type,
    count(*)::integer AS total_rows,
    count(*) FILTER (WHERE eligible)::integer AS eligible_rows,
    count(*) FILTER (WHERE NOT eligible)::integer AS excluded_rows
  FROM registry
  GROUP BY entity_type
), by_reason AS (
  SELECT reason_code, count(*)::integer AS row_count
  FROM registry
  GROUP BY reason_code
), latest_runs AS (
  SELECT id, run_type, status, requested_count, processed_count,
         succeeded_count, deferred_count, failed_count, started_at, finished_at,
         error_summary
  FROM public.search_visibility_runs
  ORDER BY started_at DESC
  LIMIT 12
), freshness AS (
  SELECT status,
    count(*)::integer AS job_count,
    min(created_at) AS oldest_created_at,
    max(processed_at) AS latest_processed_at
  FROM public.seo_freshness_jobs
  GROUP BY status
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'environment', jsonb_build_object(
    'search_visibility_urls', to_regclass('public.search_visibility_urls') IS NOT NULL,
    'search_visibility_runs', to_regclass('public.search_visibility_runs') IS NOT NULL,
    'seo_freshness_jobs', to_regclass('public.seo_freshness_jobs') IS NOT NULL
  ),
  'search_property_matches_rpc', jsonb_build_object(
    'exists', to_regprocedure('public.search_property_matches(text,text,uuid,uuid,text,text,text,numeric,numeric,numeric,numeric,integer,text,text,boolean,boolean,text,integer,integer)') IS NOT NULL,
    'anon_can_execute', CASE
      WHEN to_regprocedure('public.search_property_matches(text,text,uuid,uuid,text,text,text,numeric,numeric,numeric,numeric,integer,text,text,boolean,boolean,text,integer,integer)') IS NULL THEN false
      ELSE has_function_privilege('anon', 'public.search_property_matches(text,text,uuid,uuid,text,text,text,numeric,numeric,numeric,numeric,integer,text,text,boolean,boolean,text,integer,integer)', 'EXECUTE')
    END,
    'authenticated_can_execute', CASE
      WHEN to_regprocedure('public.search_property_matches(text,text,uuid,uuid,text,text,text,numeric,numeric,numeric,numeric,integer,text,text,boolean,boolean,text,integer,integer)') IS NULL THEN false
      ELSE has_function_privilege('authenticated', 'public.search_property_matches(text,text,uuid,uuid,text,text,text,numeric,numeric,numeric,numeric,integer,text,text,boolean,boolean,text,integer,integer)', 'EXECUTE')
    END
  ),
  'registry_checks', (SELECT to_jsonb(registry_checks) FROM registry_checks),
  'duplicate_checks', jsonb_build_object(
    'duplicate_source_key_groups', (SELECT duplicate_groups FROM duplicate_source_keys),
    'duplicate_canonical_url_groups', (SELECT duplicate_groups FROM duplicate_canonical_urls)
  ),
  'by_entity', coalesce((
    SELECT jsonb_agg(to_jsonb(by_entity) ORDER BY entity_type)
    FROM by_entity
  ), '[]'::jsonb),
  'by_reason', coalesce((
    SELECT jsonb_object_agg(reason_code, row_count)
    FROM by_reason
  ), '{}'::jsonb),
  'latest_runs', coalesce((
    SELECT jsonb_agg(to_jsonb(latest_runs) ORDER BY started_at DESC)
    FROM latest_runs
  ), '[]'::jsonb),
  'freshness', coalesce((
    SELECT jsonb_agg(to_jsonb(freshness) ORDER BY status)
    FROM freshness
  ), '[]'::jsonb),
  'latest_successful_sync', coalesce((
    SELECT to_jsonb(latest_successful_sync)
    FROM latest_successful_sync
  ), '{}'::jsonb),
  'p2_registry_shape_ok',
    (SELECT eligible_missing_canonical = 0
      AND malformed_canonical_paths = 0
      AND malformed_canonical_urls = 0
      AND rows_behind_latest_successful_sync = 0
     FROM registry_checks)
    AND (SELECT duplicate_groups = 0 FROM duplicate_source_keys)
    AND (SELECT duplicate_groups = 0 FROM duplicate_canonical_urls)
    AND EXISTS (SELECT 1 FROM latest_successful_sync),
  'p2_search_contract_ok',
    to_regprocedure('public.search_property_matches(text,text,uuid,uuid,text,text,text,numeric,numeric,numeric,numeric,integer,text,text,boolean,boolean,text,integer,integer)') IS NOT NULL
    AND has_function_privilege('anon', 'public.search_property_matches(text,text,uuid,uuid,text,text,text,numeric,numeric,numeric,numeric,integer,text,text,boolean,boolean,text,integer,integer)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.search_property_matches(text,text,uuid,uuid,text,text,text,numeric,numeric,numeric,numeric,integer,text,text,boolean,boolean,text,integer,integer)', 'EXECUTE')
) AS search_visibility_p2_verification;

ROLLBACK;
