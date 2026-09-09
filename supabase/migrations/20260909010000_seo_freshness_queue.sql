-- =============================================================================
-- SEO freshness queue — durable, server/worker-only revalidation jobs
--
-- This migration does not change public URLs or call Google APIs. The Next server
-- route inserts allowlisted paths after a successful content mutation; the worker
-- claims and retries bounded batches.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.seo_freshness_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE CHECK (length(dedupe_key) BETWEEN 1 AND 320),
  event_kind text NOT NULL CHECK (event_kind IN ('news', 'property', 'area', 'neighborhood', 'route')),
  event_action text NOT NULL CHECK (event_action IN ('create', 'update', 'delete', 'publish', 'unpublish', 'bulk')),
  path text NOT NULL CHECK (
    path ~ '^/[A-Za-z0-9/_-]*$'
    AND path !~ '//'
    AND path !~ '[?#]'
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_freshness_jobs_processing_lock_shape CHECK (
    (status = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL)
    OR status <> 'processing'
  )
);

CREATE INDEX IF NOT EXISTS seo_freshness_jobs_claim_idx
  ON public.seo_freshness_jobs(status, next_attempt_at ASC, created_at ASC)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS seo_freshness_jobs_lock_idx
  ON public.seo_freshness_jobs(locked_at)
  WHERE status = 'processing';

ALTER TABLE public.seo_freshness_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.seo_freshness_jobs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_seo_freshness_jobs(
  p_worker_id text,
  p_limit integer DEFAULT 25
)
RETURNS SETOF public.seo_freshness_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_worker_id IS NULL OR length(btrim(p_worker_id)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Worker ID không hợp lệ' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Giới hạn worker không hợp lệ' USING ERRCODE = '22023';
  END IF;

  UPDATE public.seo_freshness_jobs
     SET status = 'pending', locked_at = NULL, locked_by = NULL, updated_at = now()
   WHERE status = 'processing'
     AND locked_at < now() - interval '10 minutes';

  RETURN QUERY
  WITH picked AS (
    SELECT job.id
      FROM public.seo_freshness_jobs AS job
     WHERE job.status IN ('pending', 'failed')
       AND job.next_attempt_at <= now()
       AND job.attempt_count < job.max_attempts
     ORDER BY job.next_attempt_at ASC, job.created_at ASC, job.id ASC
     FOR UPDATE SKIP LOCKED
     LIMIT p_limit
  )
  UPDATE public.seo_freshness_jobs AS job
     SET status = 'processing', locked_at = now(), locked_by = btrim(p_worker_id), updated_at = now()
    FROM picked
   WHERE job.id = picked.id
  RETURNING job.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_seo_freshness_job(
  p_job_id uuid,
  p_worker_id text,
  p_succeeded boolean,
  p_error text DEFAULT NULL
)
RETURNS public.seo_freshness_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.seo_freshness_jobs;
  v_next_attempt integer;
BEGIN
  SELECT * INTO v_job
    FROM public.seo_freshness_jobs
   WHERE id = p_job_id
     AND status = 'processing'
     AND locked_by = btrim(p_worker_id)
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job không tồn tại hoặc không thuộc worker' USING ERRCODE = '42501';
  END IF;

  IF p_succeeded THEN
    UPDATE public.seo_freshness_jobs
       SET status = 'succeeded', processed_at = now(), locked_at = NULL, locked_by = NULL,
           last_error = NULL, updated_at = now()
     WHERE id = v_job.id
     RETURNING * INTO v_job;
    RETURN v_job;
  END IF;

  v_next_attempt := v_job.attempt_count + 1;
  UPDATE public.seo_freshness_jobs
     SET attempt_count = v_next_attempt,
         status = CASE WHEN v_next_attempt >= max_attempts THEN 'dead_letter' ELSE 'failed' END,
         next_attempt_at = CASE
           WHEN v_next_attempt >= max_attempts THEN next_attempt_at
           ELSE now() + make_interval(secs => LEAST(3600, (30 * (2 ^ LEAST(v_next_attempt, 7)))::integer))
         END,
         locked_at = NULL,
         locked_by = NULL,
         last_error = NULLIF(left(coalesce(p_error, 'Worker revalidation thất bại.'), 1000), ''),
         updated_at = now()
   WHERE id = v_job.id
   RETURNING * INTO v_job;
  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_seo_freshness_jobs(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_seo_freshness_job(uuid, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_seo_freshness_jobs(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_seo_freshness_job(uuid, text, boolean, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
