-- Commerce operations queue health projection. READ ONLY.
-- Additive migration; production execution is user-run.

CREATE OR REPLACE FUNCTION public.commerce_get_operations_queue_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_observed_at timestamptz := statement_timestamp();
  v_outbox jsonb;
  v_email jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_staff_permission('commerce-operations', 'view') THEN
    RAISE EXCEPTION 'Commerce operations view permission required.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'processing', count(*) FILTER (WHERE status = 'processing'),
    'retry', count(*) FILTER (WHERE status = 'retry'),
    'dead_letter', count(*) FILTER (WHERE status = 'dead_letter'),
    'sent', count(*) FILTER (WHERE status = 'sent'),
    'oldest_actionable_at', min(created_at) FILTER (WHERE (
      (status IN ('pending', 'retry') AND (next_attempt_at IS NULL OR next_attempt_at <= v_observed_at))
      OR (status = 'processing' AND next_attempt_at IS NOT NULL AND next_attempt_at <= v_observed_at)
      OR status = 'dead_letter'
    ))
  )
  INTO v_outbox
  FROM public.commerce_outbox;

  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'processing', count(*) FILTER (WHERE status = 'processing'),
    'retry', count(*) FILTER (WHERE status = 'retry'),
    'dead_letter', count(*) FILTER (WHERE status = 'dead_letter'),
    'sent', count(*) FILTER (WHERE status = 'sent'),
    'oldest_actionable_at', min(created_at) FILTER (WHERE (
      (status IN ('pending', 'retry') AND (next_attempt_at IS NULL OR next_attempt_at <= v_observed_at))
      OR (status = 'processing' AND next_attempt_at IS NOT NULL AND next_attempt_at <= v_observed_at)
      OR status = 'dead_letter'
    ))
  )
  INTO v_email
  FROM public.commerce_email_deliveries;

  RETURN jsonb_build_object(
    'generatedAt', v_observed_at,
    'outbox', v_outbox,
    'email', v_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_get_operations_queue_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commerce_get_operations_queue_health() TO authenticated;

NOTIFY pgrst, 'reload schema';
