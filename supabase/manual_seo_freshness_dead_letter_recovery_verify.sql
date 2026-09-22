-- Read-only verification after the recovered SEO freshness batches are processed.

BEGIN TRANSACTION READ ONLY;

WITH target_jobs AS (
  SELECT
    j.id,
    split_part(j.dedupe_key, ':', 1) AS batch_key,
    j.path,
    j.status,
    j.attempt_count,
    j.max_attempts,
    j.last_error,
    j.processed_at,
    j.updated_at
  FROM public.seo_freshness_jobs j
  WHERE split_part(j.dedupe_key, ':', 1) IN (
    '2c1d1d8ac864e15a00c415aea28b15519bf850414279d1ed4dc88ea5b3f6e604',
    '3232f98850fd69c188ff582f4ee9a87a9066131a6ff0c80175e9066fc28d146b'
  )
), summary AS (
  SELECT
    count(*) AS job_count,
    count(*) FILTER (WHERE status = 'succeeded') AS succeeded_count,
    count(*) FILTER (WHERE status = 'pending') AS pending_count,
    count(*) FILTER (WHERE status = 'processing') AS processing_count,
    count(*) FILTER (WHERE status = 'failed') AS failed_count,
    count(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_count,
    count(*) FILTER (WHERE last_error IS NOT NULL) AS error_count,
    count(*) FILTER (WHERE processed_at IS NOT NULL) AS processed_count
  FROM target_jobs
)
SELECT jsonb_build_object(
  'measured_at', now(),
  'write_performed', false,
  'summary', (SELECT to_jsonb(s) FROM summary s),
  'pass', (
    SELECT job_count = 20
      AND succeeded_count = 20
      AND pending_count = 0
      AND processing_count = 0
      AND failed_count = 0
      AND dead_letter_count = 0
      AND error_count = 0
      AND processed_count = 20
    FROM summary
  ),
  'jobs', COALESCE((
    SELECT jsonb_agg(to_jsonb(j) ORDER BY j.batch_key, j.path)
    FROM target_jobs j
  ), '[]'::jsonb)
) AS seo_freshness_dead_letter_recovery_verification;

ROLLBACK;
