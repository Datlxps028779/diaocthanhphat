-- Search Visibility canonical constraint diagnostic (READ-ONLY)
-- Run in production before the repair migration. This script does not write,
-- call Google, submit a sitemap, inspect URLs, or schedule work.

SELECT jsonb_build_object(
  'constraint_definition', (
    SELECT pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conname = 'search_visibility_url_absolute_canonical'
      AND conrelid = 'public.search_visibility_urls'::regclass
  ),
  'constraint_probe', jsonb_build_object(
    'expected_canonical_passes_current_constraint', (
      SELECT 'https://chonhaviet.com/tin-tuc/bai-viet' ~ substring(pg_get_constraintdef(oid) FROM $$'([^']+)'$$)
      FROM pg_constraint
      WHERE conname = 'search_visibility_url_absolute_canonical'
        AND conrelid = 'public.search_visibility_urls'::regclass
    ),
    'preview_origin_should_not_pass_policy', (
      SELECT 'https://preview.vercel.app/tin-tuc/bai-viet' ~ substring(pg_get_constraintdef(oid) FROM $$'([^']+)'$$)
      FROM pg_constraint
      WHERE conname = 'search_visibility_url_absolute_canonical'
        AND conrelid = 'public.search_visibility_urls'::regclass
    )
  ),
  'latest_failed_runs', (
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.started_at DESC), '[]'::jsonb)
    FROM (
      SELECT id, status, error_summary, requested_count, processed_count, started_at, finished_at
      FROM public.search_visibility_runs
      ORDER BY started_at DESC
      LIMIT 5
    ) r
  )
) AS search_visibility_constraint_dry_run;

-- Exact regex behavior independent of pg_constraint text extraction:
SELECT jsonb_build_object(
  'correct_pattern', jsonb_build_object(
    'canonical_passes', 'https://chonhaviet.com/tin-tuc/bai-viet' ~ '^https://chonhaviet\.com/[A-Za-z0-9/_-]*$',
    'preview_fails', NOT ('https://preview.vercel.app/tin-tuc/bai-viet' ~ '^https://chonhaviet\.com/[A-Za-z0-9/_-]*$'),
    'query_string_fails', NOT ('https://chonhaviet.com/tin-tuc/bai-viet?x=1' ~ '^https://chonhaviet\.com/[A-Za-z0-9/_-]*$')
  )
) AS intended_constraint_behavior;
