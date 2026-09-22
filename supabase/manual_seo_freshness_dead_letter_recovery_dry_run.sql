-- Read-only preflight for the two poisoned SEO freshness batches.
-- These jobs are requeued only after the Next route and Edge worker fixes are deployed.

BEGIN TRANSACTION READ ONLY;

WITH target_batches(batch_key) AS (
  VALUES
    ('2c1d1d8ac864e15a00c415aea28b15519bf850414279d1ed4dc88ea5b3f6e604'::text),
    ('3232f98850fd69c188ff582f4ee9a87a9066131a6ff0c80175e9066fc28d146b'::text)
), target_jobs AS (
  SELECT
    j.id,
    split_part(j.dedupe_key, ':', 1) AS batch_key,
    j.path,
    j.status,
    j.attempt_count,
    j.max_attempts,
    j.locked_at,
    j.locked_by,
    j.last_error,
    j.created_at,
    j.updated_at
  FROM public.seo_freshness_jobs j
  JOIN target_batches b ON b.batch_key = split_part(j.dedupe_key, ':', 1)
), summary AS (
  SELECT
    count(*) AS job_count,
    count(DISTINCT batch_key) AS batch_count,
    count(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_count,
    count(*) FILTER (WHERE attempt_count = max_attempts AND max_attempts = 5) AS exhausted_count,
    count(*) FILTER (WHERE locked_at IS NOT NULL OR locked_by IS NOT NULL) AS locked_count,
    count(*) FILTER (
      WHERE last_error = 'Revalidation HTTP 400: {"error":"Danh sách path không hợp lệ."}'
    ) AS expected_error_count
  FROM target_jobs
)
SELECT jsonb_build_object(
  'measured_at', now(),
  'write_performed', false,
  'expected', jsonb_build_object('batch_count', 2, 'job_count', 20),
  'summary', (SELECT to_jsonb(s) FROM summary s),
  'safe_to_requeue_after_deploy', (
    SELECT batch_count = 2
      AND job_count = 20
      AND dead_letter_count = 20
      AND exhausted_count = 20
      AND locked_count = 0
      AND expected_error_count = 20
    FROM summary
  ),
  'jobs', COALESCE((
    SELECT jsonb_agg(to_jsonb(j) ORDER BY j.batch_key, j.path)
    FROM target_jobs j
  ), '[]'::jsonb)
) AS seo_freshness_dead_letter_recovery_dry_run;

ROLLBACK;
