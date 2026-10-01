-- =============================================================================
-- Commerce reconciliation: provider lookup queue feeding the durable event inbox
-- Additive only. Production execution is user-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.commerce_payment_reconciliation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_attempt_id uuid NOT NULL UNIQUE
    REFERENCES public.commerce_payment_attempts(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','retry','processed','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consecutive_errors integer NOT NULL DEFAULT 0 CHECK (consecutive_errors >= 0),
  processing_token uuid,
  next_attempt_at timestamptz,
  last_observed_status text
    CHECK (last_observed_status IS NULL OR last_observed_status IN ('pending','succeeded','failed','cancelled','expired')),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CHECK (next_attempt_at IS NULL OR isfinite(next_attempt_at))
);

CREATE INDEX IF NOT EXISTS idx_commerce_payment_reconciliation_work
  ON public.commerce_payment_reconciliation_jobs(status, next_attempt_at, created_at);

ALTER TABLE public.commerce_payment_reconciliation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commerce_payment_reconciliation_jobs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_commerce_payment_reconciliation_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.provider_payment_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('succeeded','failed','cancelled','partially_refunded','refunded','chargeback') THEN
    UPDATE public.commerce_payment_reconciliation_jobs j
    SET status = 'processed', processing_token = NULL, next_attempt_at = NULL,
        processed_at = COALESCE(j.processed_at, clock_timestamp()), updated_at = clock_timestamp()
    WHERE j.payment_attempt_id = NEW.id
      AND j.status <> 'processed';
  ELSIF NEW.status = 'pending' THEN
    INSERT INTO public.commerce_payment_reconciliation_jobs(
      payment_attempt_id, status, attempts, consecutive_errors, next_attempt_at
    ) VALUES (
      NEW.id, 'pending', 0, 0, clock_timestamp() + interval '2 minutes'
    )
    ON CONFLICT (payment_attempt_id) DO UPDATE
    SET status = 'pending', attempts = 0, consecutive_errors = 0, processing_token = NULL,
        next_attempt_at = clock_timestamp() + interval '2 minutes',
        last_error_code = NULL, processed_at = NULL, updated_at = clock_timestamp()
    WHERE commerce_payment_reconciliation_jobs.status IN ('processed','dead_letter');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_commerce_payment_reconciliation_job() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_commerce_payment_reconciliation_job
AFTER UPDATE OF provider_payment_id, status ON public.commerce_payment_attempts
FOR EACH ROW EXECUTE FUNCTION public.sync_commerce_payment_reconciliation_job();

INSERT INTO public.commerce_payment_reconciliation_jobs(
  payment_attempt_id, status, attempts, consecutive_errors, next_attempt_at
)
SELECT a.id, 'pending', 0, 0, clock_timestamp()
FROM public.commerce_payment_attempts a
WHERE a.provider_payment_id IS NOT NULL
  AND a.status = 'pending'
ON CONFLICT (payment_attempt_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.commerce_claim_payment_reconciliations(
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  reconciliation_job_id uuid,
  processing_token uuid,
  payment_attempt_id uuid,
  provider text,
  provider_payment_id text,
  amount_minor bigint,
  currency text,
  attempt_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'Invalid reconciliation claim limit.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT j.id
    FROM public.commerce_payment_reconciliation_jobs j
    JOIN public.commerce_payment_attempts a ON a.id = j.payment_attempt_id
    WHERE a.status = 'pending'
      AND a.provider_payment_id IS NOT NULL
      AND (
        (j.status IN ('pending','retry') AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= clock_timestamp()))
        OR (j.status = 'processing' AND j.next_attempt_at IS NOT NULL AND j.next_attempt_at <= clock_timestamp())
      )
    ORDER BY j.created_at, j.id
    FOR UPDATE OF j SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE public.commerce_payment_reconciliation_jobs j
    SET status = 'processing', attempts = j.attempts + 1,
        processing_token = gen_random_uuid(),
        next_attempt_at = clock_timestamp() + interval '2 minutes',
        last_error_code = NULL, updated_at = clock_timestamp()
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.id, j.processing_token, j.payment_attempt_id, j.attempts
  )
  SELECT c.id, c.processing_token, a.id, a.provider, a.provider_payment_id,
         a.amount_minor, a.currency, c.attempts
  FROM claimed c
  JOIN public.commerce_payment_attempts a ON a.id = c.payment_attempt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_complete_payment_reconciliation(
  p_reconciliation_job_id uuid,
  p_processing_token uuid,
  p_provider_payment_id text,
  p_provider_status text,
  p_amount_minor bigint,
  p_currency text,
  p_provider_lookup_hash text,
  p_paid_at timestamptz,
  p_observed_at timestamptz
)
RETURNS TABLE(
  reconciliation_job_id uuid,
  outcome text,
  webhook_inbox_id uuid,
  payment_event_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_identity record;
  v_job public.commerce_payment_reconciliation_jobs%ROWTYPE;
  v_attempt_identity record;
  v_attempt public.commerce_payment_attempts%ROWTYPE;
  v_order public.commerce_orders%ROWTYPE;
  v_inbox public.commerce_webhook_inbox%ROWTYPE;
  v_event public.commerce_payment_events%ROWTYPE;
  v_provider_event_id text;
  v_event_type text;
  v_payload jsonb;
  v_occurred_at timestamptz;
  v_next_status text;
  v_next_attempt_at timestamptz;
  v_reconcile_until timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_reconciliation_job_id IS NULL OR p_processing_token IS NULL THEN
    RAISE EXCEPTION 'Reconciliation job id and processing token are required.' USING ERRCODE = '22023';
  END IF;
  IF p_provider_payment_id IS NULL OR char_length(btrim(p_provider_payment_id)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid reconciled provider payment id.' USING ERRCODE = '22023';
  END IF;
  IF p_provider_status IS NULL OR p_provider_status NOT IN ('pending','succeeded','failed','cancelled','expired') THEN
    RAISE EXCEPTION 'Invalid reconciled provider status.' USING ERRCODE = '22023';
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor < 0 OR p_currency <> 'VND' THEN
    RAISE EXCEPTION 'Invalid reconciled amount or currency.' USING ERRCODE = '22023';
  END IF;
  IF p_provider_lookup_hash IS NULL OR p_provider_lookup_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid provider lookup hash.' USING ERRCODE = '22023';
  END IF;
  IF p_observed_at IS NULL OR NOT isfinite(p_observed_at)
     OR (p_paid_at IS NOT NULL AND NOT isfinite(p_paid_at)) THEN
    RAISE EXCEPTION 'Reconciliation timestamps must be finite.' USING ERRCODE = '22023';
  END IF;

  SELECT j.payment_attempt_id
  INTO v_job_identity
  FROM public.commerce_payment_reconciliation_jobs j
  WHERE j.id = p_reconciliation_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment reconciliation job not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT a.order_id
  INTO v_attempt_identity
  FROM public.commerce_payment_attempts a
  WHERE a.id = v_job_identity.payment_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation payment attempt not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.commerce_orders o
  WHERE o.id = v_attempt_identity.order_id
  FOR UPDATE;

  SELECT * INTO v_attempt
  FROM public.commerce_payment_attempts a
  WHERE a.id = v_job_identity.payment_attempt_id
    AND a.order_id = v_order.id
  FOR UPDATE;

  SELECT * INTO v_job
  FROM public.commerce_payment_reconciliation_jobs j
  WHERE j.id = p_reconciliation_job_id
    AND j.payment_attempt_id = v_attempt.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment reconciliation job changed concurrently.' USING ERRCODE = '40001';
  END IF;
  IF v_job.status = 'processed' THEN
    RETURN QUERY SELECT v_job.id, 'already_processed'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_job.status <> 'processing' OR v_job.processing_token IS DISTINCT FROM p_processing_token THEN
    RAISE EXCEPTION 'Reconciliation claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.provider_payment_id IS DISTINCT FROM btrim(p_provider_payment_id) THEN
    RAISE EXCEPTION 'Provider lookup identity does not match payment attempt.' USING ERRCODE = '22023';
  END IF;
  IF v_attempt.amount_minor <> p_amount_minor OR v_order.total_minor <> p_amount_minor THEN
    RAISE EXCEPTION 'Provider lookup amount does not match attempt and order.' USING ERRCODE = '22023';
  END IF;
  IF v_attempt.currency <> p_currency OR v_order.currency <> p_currency THEN
    RAISE EXCEPTION 'Provider lookup currency does not match attempt and order.' USING ERRCODE = '22023';
  END IF;

  IF v_attempt.status <> 'pending' THEN
    UPDATE public.commerce_payment_reconciliation_jobs j
    SET status = 'processed', processing_token = NULL, next_attempt_at = NULL,
        consecutive_errors = 0,
        last_observed_status = p_provider_status, processed_at = COALESCE(j.processed_at, clock_timestamp()),
        updated_at = clock_timestamp()
    WHERE j.id = v_job.id;

    RETURN QUERY SELECT v_job.id, 'attempt_terminal'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  IF p_provider_status = 'pending' THEN
    v_reconcile_until := COALESCE(
      v_attempt.expires_at,
      v_attempt.created_at + interval '15 minutes'
    ) + interval '24 hours';

    IF clock_timestamp() <= v_reconcile_until THEN
      v_next_status := 'retry';
      v_next_attempt_at := clock_timestamp() + CASE v_job.attempts
        WHEN 1 THEN interval '30 seconds'
        WHEN 2 THEN interval '1 minute'
        WHEN 3 THEN interval '2 minutes'
        WHEN 4 THEN interval '3 minutes'
        WHEN 5 THEN interval '5 minutes'
        ELSE interval '30 minutes'
      END;
    ELSE
      v_next_status := 'dead_letter';
      v_next_attempt_at := NULL;
    END IF;

    UPDATE public.commerce_payment_reconciliation_jobs j
    SET status = v_next_status, processing_token = NULL,
        next_attempt_at = v_next_attempt_at, last_observed_status = 'pending',
        consecutive_errors = 0,
        last_error_code = CASE WHEN v_next_status = 'dead_letter' THEN 'provider_pending_after_grace' ELSE NULL END,
        updated_at = clock_timestamp()
    WHERE j.id = v_job.id;

    IF v_next_status = 'dead_letter' THEN
      INSERT INTO public.commerce_audit_events(
        owner_user_id, actor_role, entity_type, entity_id,
        event_type, correlation_id, after_state
      ) VALUES (
        v_order.owner_user_id, 'system', 'payment_reconciliation_job', v_job.id,
        'payment_reconciliation_dead_lettered', v_attempt.id::text,
        jsonb_build_object(
          'reason', 'provider_pending_after_grace',
          'reconcile_until', v_reconcile_until,
          'attempts', v_job.attempts
        )
      );
    END IF;

    RETURN QUERY SELECT v_job.id, v_next_status, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  v_provider_event_id := 'lookup:' || v_attempt.id::text || ':' || p_provider_status;
  v_event_type := CASE WHEN p_provider_status = 'succeeded' THEN 'payment.succeeded' ELSE 'payment.failed' END;
  v_occurred_at := CASE WHEN p_provider_status = 'succeeded' THEN COALESCE(p_paid_at, p_observed_at) ELSE p_observed_at END;
  v_payload := jsonb_build_object(
    'source', 'provider_api_lookup',
    'provider', v_attempt.provider,
    'providerPaymentId', v_attempt.provider_payment_id,
    'status', p_provider_status,
    'amountMinor', p_amount_minor,
    'currency', p_currency,
    'paidAt', p_paid_at,
    'observedAt', p_observed_at
  );

  SELECT * INTO v_event
  FROM public.commerce_payment_events e
  WHERE e.provider = v_attempt.provider
    AND e.provider_event_id = v_provider_event_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.verification_method <> 'provider_api_lookup'
       OR v_event.provider_lookup_hash <> p_provider_lookup_hash
       OR v_event.provider_payment_id <> v_attempt.provider_payment_id
       OR v_event.event_type <> v_event_type
       OR v_event.amount_minor <> p_amount_minor
       OR v_event.currency <> p_currency THEN
      RAISE EXCEPTION 'Provider lookup event identity conflicts with existing event.' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_inbox
    FROM public.commerce_webhook_inbox i
    WHERE i.provider = v_attempt.provider
      AND i.provider_event_id = v_provider_event_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_inbox.verification_method <> 'provider_api_lookup'
       OR v_inbox.provider_lookup_hash <> p_provider_lookup_hash THEN
      RAISE EXCEPTION 'Provider lookup inbox and event are inconsistent.' USING ERRCODE = '23514';
    END IF;
  ELSE
    INSERT INTO public.commerce_webhook_inbox(
      provider, provider_event_id, status, headers, payload, payload_hash,
      verification_method, signed_data_hash, provider_lookup_hash,
      attempts, next_attempt_at
    ) VALUES (
      v_attempt.provider, v_provider_event_id, 'pending', '{}'::jsonb, v_payload,
      p_provider_lookup_hash, 'provider_api_lookup', NULL, p_provider_lookup_hash,
      0, clock_timestamp()
    ) RETURNING * INTO v_inbox;

    INSERT INTO public.commerce_payment_events(
      provider, provider_event_id, provider_payment_id, payment_attempt_id, order_id,
      event_type, signature_valid, verification_method, amount_minor, currency,
      payload_hash, signed_data_hash, provider_lookup_hash, payload, occurred_at
    ) VALUES (
      v_attempt.provider, v_provider_event_id, v_attempt.provider_payment_id, v_attempt.id, v_order.id,
      v_event_type, false, 'provider_api_lookup', p_amount_minor, p_currency,
      p_provider_lookup_hash, NULL, p_provider_lookup_hash, v_payload, v_occurred_at
    ) RETURNING * INTO v_event;
  END IF;

  UPDATE public.commerce_payment_reconciliation_jobs j
  SET status = 'processed', processing_token = NULL, next_attempt_at = NULL,
      consecutive_errors = 0,
      last_observed_status = p_provider_status, last_error_code = NULL,
      processed_at = COALESCE(j.processed_at, clock_timestamp()), updated_at = clock_timestamp()
  WHERE j.id = v_job.id;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state, metadata
  ) VALUES (
    v_order.owner_user_id, 'system', 'payment_attempt', v_attempt.id,
    'payment_reconciliation_enqueued', v_provider_event_id,
    jsonb_build_object('provider_status', p_provider_status, 'payment_event_id', v_event.id),
    jsonb_build_object('reconciliation_job_id', v_job.id, 'webhook_inbox_id', v_inbox.id)
  );

  RETURN QUERY SELECT v_job.id, 'event_enqueued'::text, v_inbox.id, v_event.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_fail_payment_reconciliation(
  p_reconciliation_job_id uuid,
  p_processing_token uuid,
  p_error_code text,
  p_retryable boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.commerce_payment_reconciliation_jobs%ROWTYPE;
  v_next_status text;
  v_next_attempt_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_reconciliation_job_id IS NULL OR p_processing_token IS NULL THEN
    RAISE EXCEPTION 'Reconciliation job id and processing token are required.' USING ERRCODE = '22023';
  END IF;
  IF p_error_code IS NULL OR p_error_code !~ '^[A-Za-z0-9_:-]{2,80}$' THEN
    RAISE EXCEPTION 'Invalid reconciliation error code.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job
  FROM public.commerce_payment_reconciliation_jobs j
  WHERE j.id = p_reconciliation_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment reconciliation job not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.status = 'processed' THEN
    RETURN 'processed';
  END IF;
  IF v_job.status <> 'processing' OR v_job.processing_token IS DISTINCT FROM p_processing_token THEN
    RAISE EXCEPTION 'Reconciliation claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;

  IF p_retryable AND v_job.consecutive_errors < 7 THEN
    v_next_status := 'retry';
    v_next_attempt_at := clock_timestamp() + CASE v_job.consecutive_errors
      WHEN 0 THEN interval '30 seconds'
      WHEN 1 THEN interval '1 minute'
      WHEN 2 THEN interval '2 minutes'
      WHEN 3 THEN interval '3 minutes'
      WHEN 4 THEN interval '5 minutes'
      ELSE interval '10 minutes'
    END;
  ELSE
    v_next_status := 'dead_letter';
    v_next_attempt_at := NULL;
  END IF;

  UPDATE public.commerce_payment_reconciliation_jobs j
  SET status = v_next_status, processing_token = NULL,
      next_attempt_at = v_next_attempt_at,
      consecutive_errors = j.consecutive_errors + 1,
      last_error_code = p_error_code,
      updated_at = clock_timestamp()
  WHERE j.id = v_job.id;

  INSERT INTO public.commerce_audit_events(
    actor_role, entity_type, entity_id, event_type, correlation_id, after_state
  ) VALUES (
    'system', 'payment_reconciliation_job', v_job.id,
    CASE WHEN v_next_status = 'retry'
      THEN 'payment_reconciliation_retry_scheduled'
      ELSE 'payment_reconciliation_dead_lettered'
    END,
    v_job.payment_attempt_id::text,
    jsonb_build_object(
      'status', v_next_status, 'attempts', v_job.attempts,
      'consecutive_errors', v_job.consecutive_errors + 1,
      'error_code', p_error_code, 'next_attempt_at', v_next_attempt_at
    )
  );

  RETURN v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_claim_payment_reconciliations(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_complete_payment_reconciliation(
  uuid, uuid, text, text, bigint, text, text, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_fail_payment_reconciliation(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_claim_payment_reconciliations(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_complete_payment_reconciliation(
  uuid, uuid, text, text, bigint, text, text, timestamptz, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_fail_payment_reconciliation(uuid, uuid, text, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
