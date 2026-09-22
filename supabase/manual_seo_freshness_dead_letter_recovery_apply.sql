-- Requeue exactly the two SEO freshness batches poisoned by the old area-subpage allowlist.
-- Run only after both are live:
--   1. Next route accepts /khu-vuc/{slug}/thong-tin and /tin-tuc.
--   2. seo-freshness-worker records outcomes per path instead of per batch.

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

DO $$
DECLARE
  v_job_count integer;
  v_batch_count integer;
  v_dead_letter_count integer;
  v_exhausted_count integer;
  v_locked_count integer;
  v_expected_error_count integer;
  v_updated_count integer;
BEGIN
  PERFORM 1
  FROM public.seo_freshness_jobs j
  WHERE split_part(j.dedupe_key, ':', 1) IN (
    '2c1d1d8ac864e15a00c415aea28b15519bf850414279d1ed4dc88ea5b3f6e604',
    '3232f98850fd69c188ff582f4ee9a87a9066131a6ff0c80175e9066fc28d146b'
  )
  FOR UPDATE;

  SELECT
    count(*),
    count(DISTINCT split_part(j.dedupe_key, ':', 1)),
    count(*) FILTER (WHERE j.status = 'dead_letter'),
    count(*) FILTER (WHERE j.attempt_count = j.max_attempts AND j.max_attempts = 5),
    count(*) FILTER (WHERE j.locked_at IS NOT NULL OR j.locked_by IS NOT NULL),
    count(*) FILTER (
      WHERE j.last_error = 'Revalidation HTTP 400: {"error":"Danh sách path không hợp lệ."}'
    )
  INTO
    v_job_count,
    v_batch_count,
    v_dead_letter_count,
    v_exhausted_count,
    v_locked_count,
    v_expected_error_count
  FROM public.seo_freshness_jobs j
  WHERE split_part(j.dedupe_key, ':', 1) IN (
    '2c1d1d8ac864e15a00c415aea28b15519bf850414279d1ed4dc88ea5b3f6e604',
    '3232f98850fd69c188ff582f4ee9a87a9066131a6ff0c80175e9066fc28d146b'
  );

  IF v_batch_count <> 2
     OR v_job_count <> 20
     OR v_dead_letter_count <> 20
     OR v_exhausted_count <> 20
     OR v_locked_count <> 0
     OR v_expected_error_count <> 20
  THEN
    RAISE EXCEPTION
      'Recovery aborted: expected 2 batches/20 exhausted unlocked dead-letter jobs, found batches=%, jobs=%, dead=%, exhausted=%, locked=%, matching_error=%',
      v_batch_count, v_job_count, v_dead_letter_count, v_exhausted_count, v_locked_count, v_expected_error_count;
  END IF;

  UPDATE public.seo_freshness_jobs j
  SET status = 'pending',
      attempt_count = 0,
      next_attempt_at = now(),
      locked_at = NULL,
      locked_by = NULL,
      last_error = NULL,
      processed_at = NULL,
      updated_at = now()
  WHERE split_part(j.dedupe_key, ':', 1) IN (
    '2c1d1d8ac864e15a00c415aea28b15519bf850414279d1ed4dc88ea5b3f6e604',
    '3232f98850fd69c188ff582f4ee9a87a9066131a6ff0c80175e9066fc28d146b'
  );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 20 THEN
    RAISE EXCEPTION 'Recovery aborted: expected to update 20 jobs, updated %', v_updated_count;
  END IF;

  RAISE NOTICE 'seo_freshness_recovery=%', jsonb_build_object(
    'batch_count', v_batch_count,
    'requeued_jobs', v_updated_count,
    'completed_at', now()
  );
END
$$;

COMMIT;
