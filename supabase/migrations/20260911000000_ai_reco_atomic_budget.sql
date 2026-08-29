-- =============================================================================
-- Atomic quota for paid AI recommendation cache misses
-- =============================================================================
-- ai-reco calls Claude only after a cache miss. This function reserves one shared
-- minute/hour slot under a transaction advisory lock so concurrent Edge instances
-- cannot all pass a non-atomic count check. Only service_role may execute it.

CREATE TABLE IF NOT EXISTS public.ai_reco_budget_buckets (
  bucket_type text NOT NULL CHECK (bucket_type IN ('minute', 'hour')),
  bucket_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (bucket_type, bucket_start)
);

ALTER TABLE public.ai_reco_budget_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_reco_budget_buckets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reserve_ai_reco_budget()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_minute_start timestamptz := date_trunc('minute', v_now);
  v_hour_start timestamptz := date_trunc('hour', v_now);
  v_minute_count integer;
  v_hour_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-reco-budget', 0));

  INSERT INTO public.ai_reco_budget_buckets (bucket_type, bucket_start, request_count)
  VALUES
    ('minute', v_minute_start, 0),
    ('hour', v_hour_start, 0)
  ON CONFLICT (bucket_type, bucket_start) DO NOTHING;

  SELECT request_count INTO v_minute_count
  FROM public.ai_reco_budget_buckets
  WHERE bucket_type = 'minute' AND bucket_start = v_minute_start
  FOR UPDATE;

  SELECT request_count INTO v_hour_count
  FROM public.ai_reco_budget_buckets
  WHERE bucket_type = 'hour' AND bucket_start = v_hour_start
  FOR UPDATE;

  IF COALESCE(v_minute_count, 0) >= 30 OR COALESCE(v_hour_count, 0) >= 300 THEN
    RETURN false;
  END IF;

  UPDATE public.ai_reco_budget_buckets
  SET request_count = request_count + 1
  WHERE (bucket_type = 'minute' AND bucket_start = v_minute_start)
     OR (bucket_type = 'hour' AND bucket_start = v_hour_start);

  DELETE FROM public.ai_reco_budget_buckets
  WHERE bucket_start < v_now - interval '2 days';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_reco_budget() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_reco_budget() TO service_role;

NOTIFY pgrst, 'reload schema';
