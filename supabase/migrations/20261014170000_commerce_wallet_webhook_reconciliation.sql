-- =============================================================================
-- Commerce Wallet webhook processing and provider reconciliation
-- Reuses the verified webhook inbox; never creates package orders or entitlements.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.commerce_wallet_topup_reconciliation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topup_checkout_id uuid NOT NULL UNIQUE
    REFERENCES public.commerce_wallet_topup_checkouts(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9_-]{2,40}$'),
  provider_payment_id text NOT NULL CHECK (char_length(btrim(provider_payment_id)) BETWEEN 1 AND 160),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','retry','processed','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  processing_token uuid,
  next_attempt_at timestamptz,
  last_observed_status text CHECK (last_observed_status IS NULL OR last_observed_status IN ('pending','succeeded','failed','cancelled','expired')),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CHECK (next_attempt_at IS NULL OR isfinite(next_attempt_at))
);

CREATE INDEX IF NOT EXISTS idx_commerce_wallet_topup_reconciliation_work
  ON public.commerce_wallet_topup_reconciliation_jobs(status, next_attempt_at, created_at);

ALTER TABLE public.commerce_wallet_topup_reconciliation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commerce_wallet_topup_reconciliation_jobs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_commerce_wallet_topup_reconciliation_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.provider_payment_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('succeeded','failed','cancelled','expired') THEN
    UPDATE public.commerce_wallet_topup_reconciliation_jobs j
    SET status = 'processed', processing_token = NULL, next_attempt_at = NULL,
        processed_at = COALESCE(j.processed_at, clock_timestamp()), updated_at = clock_timestamp()
    WHERE j.topup_checkout_id = NEW.id AND j.status <> 'processed';
    RETURN NEW;
  END IF;

  IF NEW.status <> 'pending' AND NEW.status <> 'recovery_required' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.commerce_wallet_topup_reconciliation_jobs(
    topup_checkout_id, provider, provider_payment_id, amount_minor, currency,
    status, attempts, next_attempt_at
  ) VALUES (
    NEW.id, NEW.provider, NEW.provider_payment_id, NEW.amount_minor, NEW.currency,
    'pending', 0, clock_timestamp()
  )
  ON CONFLICT (topup_checkout_id) DO UPDATE
  SET provider = EXCLUDED.provider,
      provider_payment_id = EXCLUDED.provider_payment_id,
      amount_minor = EXCLUDED.amount_minor,
      currency = EXCLUDED.currency,
      status = CASE
        WHEN commerce_wallet_topup_reconciliation_jobs.status IN ('processed','dead_letter')
          THEN 'pending'
        ELSE commerce_wallet_topup_reconciliation_jobs.status
      END,
      processing_token = CASE
        WHEN commerce_wallet_topup_reconciliation_jobs.status IN ('processed','dead_letter')
          THEN NULL
        ELSE commerce_wallet_topup_reconciliation_jobs.processing_token
      END,
      next_attempt_at = CASE
        WHEN commerce_wallet_topup_reconciliation_jobs.status IN ('processed','dead_letter')
          THEN clock_timestamp()
        ELSE commerce_wallet_topup_reconciliation_jobs.next_attempt_at
      END,
      processed_at = CASE
        WHEN commerce_wallet_topup_reconciliation_jobs.status IN ('processed','dead_letter')
          THEN NULL
        ELSE commerce_wallet_topup_reconciliation_jobs.processed_at
      END,
      updated_at = clock_timestamp();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_commerce_wallet_topup_reconciliation_job() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_commerce_wallet_topup_reconciliation_job ON public.commerce_wallet_topup_checkouts;
CREATE TRIGGER trg_commerce_wallet_topup_reconciliation_job
AFTER INSERT OR UPDATE OF provider_payment_id, status ON public.commerce_wallet_topup_checkouts
FOR EACH ROW EXECUTE FUNCTION public.sync_commerce_wallet_topup_reconciliation_job();

INSERT INTO public.commerce_wallet_topup_reconciliation_jobs(
  topup_checkout_id, provider, provider_payment_id, amount_minor, currency,
  status, attempts, next_attempt_at
)
SELECT c.id, c.provider, c.provider_payment_id, c.amount_minor, c.currency,
       'pending', 0, clock_timestamp()
FROM public.commerce_wallet_topup_checkouts c
WHERE c.provider_payment_id IS NOT NULL
  AND c.status IN ('pending','recovery_required')
ON CONFLICT (topup_checkout_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.commerce_claim_wallet_topup_reconciliations(
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  reconciliation_job_id uuid,
  processing_token uuid,
  topup_checkout_id uuid,
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
    RAISE EXCEPTION 'Invalid wallet reconciliation claim limit.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT j.id
    FROM public.commerce_wallet_topup_reconciliation_jobs j
    JOIN public.commerce_wallet_topup_checkouts c ON c.id = j.topup_checkout_id
    WHERE c.status IN ('pending','recovery_required')
      AND (
        (j.status IN ('pending','retry') AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= clock_timestamp()))
        OR (j.status = 'processing' AND j.next_attempt_at IS NOT NULL AND j.next_attempt_at <= clock_timestamp())
      )
    ORDER BY j.created_at, j.id
    FOR UPDATE OF j SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE public.commerce_wallet_topup_reconciliation_jobs j
    SET status = 'processing',
        attempts = j.attempts + 1,
        processing_token = gen_random_uuid(),
        next_attempt_at = clock_timestamp() + interval '2 minutes',
        last_error_code = NULL,
        updated_at = clock_timestamp()
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.id, j.processing_token, j.topup_checkout_id, j.attempts
  )
  SELECT x.id, x.processing_token, x.topup_checkout_id,
         j.provider, j.provider_payment_id, j.amount_minor, j.currency, x.attempts
  FROM claimed x
  JOIN public.commerce_wallet_topup_reconciliation_jobs j ON j.id = x.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_complete_wallet_topup_reconciliation(
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
  v_job public.commerce_wallet_topup_reconciliation_jobs%ROWTYPE;
  v_checkout public.commerce_wallet_topup_checkouts%ROWTYPE;
  v_intent public.commerce_wallet_topup_intents%ROWTYPE;
  v_inbox public.commerce_webhook_inbox%ROWTYPE;
  v_event public.commerce_payment_events%ROWTYPE;
  v_provider_event_id text;
  v_event_type text;
  v_payload jsonb;
  v_occurred_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_reconciliation_job_id IS NULL OR p_processing_token IS NULL
     OR p_provider_payment_id IS NULL OR char_length(btrim(p_provider_payment_id)) NOT BETWEEN 1 AND 160
     OR p_provider_status NOT IN ('pending','succeeded','failed','cancelled','expired')
     OR p_amount_minor IS NULL OR p_amount_minor < 0 OR p_currency <> 'VND'
     OR p_provider_lookup_hash IS NULL OR p_provider_lookup_hash !~ '^[0-9a-f]{64}$'
     OR p_observed_at IS NULL OR NOT isfinite(p_observed_at)
     OR (p_paid_at IS NOT NULL AND NOT isfinite(p_paid_at)) THEN
    RAISE EXCEPTION 'Invalid wallet reconciliation result.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job
  FROM public.commerce_wallet_topup_reconciliation_jobs j
  WHERE j.id = p_reconciliation_job_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet reconciliation job not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.status = 'processed' THEN
    RETURN QUERY SELECT v_job.id, 'already_processed'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF v_job.status <> 'processing' OR v_job.processing_token IS DISTINCT FROM p_processing_token THEN
    RAISE EXCEPTION 'Wallet reconciliation claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;
  IF v_job.provider_payment_id <> btrim(p_provider_payment_id)
     OR v_job.amount_minor <> p_amount_minor
     OR v_job.currency <> p_currency THEN
    RAISE EXCEPTION 'Wallet provider lookup does not match checkout snapshot.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_checkout
  FROM public.commerce_wallet_topup_checkouts c
  WHERE c.id = v_job.topup_checkout_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet top-up checkout not found.' USING ERRCODE = 'P0002';
  END IF;

  IF p_provider_status = 'pending' THEN
    UPDATE public.commerce_wallet_topup_reconciliation_jobs j
    SET status = CASE WHEN clock_timestamp() <= v_checkout.expires_at + interval '24 hours' THEN 'retry' ELSE 'dead_letter' END,
        processing_token = NULL,
        next_attempt_at = CASE WHEN clock_timestamp() <= v_checkout.expires_at + interval '24 hours'
          THEN clock_timestamp() + interval '30 seconds' ELSE NULL END,
        last_observed_status = 'pending',
        last_error_code = CASE WHEN clock_timestamp() <= v_checkout.expires_at + interval '24 hours'
          THEN NULL ELSE 'provider_pending_after_grace' END,
        processed_at = CASE WHEN clock_timestamp() <= v_checkout.expires_at + interval '24 hours'
          THEN NULL ELSE clock_timestamp() END,
        updated_at = clock_timestamp()
    WHERE j.id = v_job.id;
    RETURN QUERY SELECT v_job.id,
      CASE WHEN clock_timestamp() <= v_checkout.expires_at + interval '24 hours' THEN 'retry' ELSE 'dead_letter' END,
      NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  v_provider_event_id := 'lookup:wallet:' || v_checkout.id::text || ':' || p_provider_status;
  v_event_type := CASE WHEN p_provider_status = 'succeeded' THEN 'payment.succeeded' ELSE 'payment.failed' END;
  v_occurred_at := CASE WHEN p_provider_status = 'succeeded' THEN COALESCE(p_paid_at, p_observed_at) ELSE p_observed_at END;
  v_payload := jsonb_build_object(
    'source', 'provider_api_lookup',
    'provider', v_checkout.provider,
    'providerPaymentId', v_checkout.provider_payment_id,
    'providerOrderCode', v_checkout.provider_order_code,
    'status', p_provider_status,
    'amountMinor', p_amount_minor,
    'currency', p_currency,
    'paidAt', p_paid_at,
    'observedAt', p_observed_at
  );

  SELECT * INTO v_event
  FROM public.commerce_payment_events e
  WHERE e.provider = v_checkout.provider AND e.provider_event_id = v_provider_event_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.verification_method <> 'provider_api_lookup'
       OR v_event.provider_lookup_hash <> p_provider_lookup_hash
       OR v_event.provider_payment_id <> v_checkout.provider_payment_id
       OR v_event.event_type <> v_event_type
       OR v_event.amount_minor <> p_amount_minor
       OR v_event.currency <> p_currency THEN
      RAISE EXCEPTION 'Wallet lookup event conflicts with existing event.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_inbox
    FROM public.commerce_webhook_inbox i
    WHERE i.provider = v_checkout.provider AND i.provider_event_id = v_provider_event_id
    FOR UPDATE;
  ELSE
    INSERT INTO public.commerce_webhook_inbox(
      provider, provider_event_id, status, headers, payload, payload_hash,
      verification_method, signed_data_hash, provider_lookup_hash, attempts, next_attempt_at
    ) VALUES (
      v_checkout.provider, v_provider_event_id, 'pending', '{}'::jsonb, v_payload,
      p_provider_lookup_hash, 'provider_api_lookup', NULL, p_provider_lookup_hash, 0, clock_timestamp()
    ) RETURNING * INTO v_inbox;

    INSERT INTO public.commerce_payment_events(
      provider, provider_event_id, provider_payment_id, payment_attempt_id, order_id,
      event_type, signature_valid, verification_method, amount_minor, currency,
      payload_hash, signed_data_hash, provider_lookup_hash, payload, occurred_at
    ) VALUES (
      v_checkout.provider, v_provider_event_id, v_checkout.provider_payment_id, NULL, NULL,
      v_event_type, false, 'provider_api_lookup', p_amount_minor, p_currency,
      p_provider_lookup_hash, NULL, p_provider_lookup_hash, v_payload, v_occurred_at
    ) RETURNING * INTO v_event;
  END IF;

  UPDATE public.commerce_wallet_topup_reconciliation_jobs j
  SET status = 'processed', processing_token = NULL, next_attempt_at = NULL,
      last_observed_status = p_provider_status, last_error_code = NULL,
      processed_at = COALESCE(j.processed_at, clock_timestamp()), updated_at = clock_timestamp()
  WHERE j.id = v_job.id;

  RETURN QUERY SELECT v_job.id, 'event_enqueued'::text, v_inbox.id, v_event.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_fail_wallet_topup_reconciliation(
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
  v_job public.commerce_wallet_topup_reconciliation_jobs%ROWTYPE;
  v_next_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_reconciliation_job_id IS NULL OR p_processing_token IS NULL
     OR p_error_code IS NULL OR p_error_code !~ '^[A-Za-z0-9_:-]{2,80}$' THEN
    RAISE EXCEPTION 'Invalid wallet reconciliation failure.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job
  FROM public.commerce_wallet_topup_reconciliation_jobs j
  WHERE j.id = p_reconciliation_job_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet reconciliation job not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.status = 'processed' THEN RETURN 'processed'; END IF;
  IF v_job.status <> 'processing' OR v_job.processing_token IS DISTINCT FROM p_processing_token THEN
    RAISE EXCEPTION 'Wallet reconciliation claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;

  v_next_status := CASE WHEN p_retryable AND v_job.attempts < 8 THEN 'retry' ELSE 'dead_letter' END;
  UPDATE public.commerce_wallet_topup_reconciliation_jobs j
  SET status = v_next_status,
      processing_token = NULL,
      next_attempt_at = CASE WHEN v_next_status = 'retry' THEN clock_timestamp() + interval '1 minute' ELSE NULL END,
      last_error_code = p_error_code,
      processed_at = CASE WHEN v_next_status = 'dead_letter' THEN clock_timestamp() ELSE NULL END,
      updated_at = clock_timestamp()
  WHERE j.id = v_job.id;
  RETURN v_next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_claim_payment_webhooks(
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  webhook_inbox_id uuid,
  processing_token uuid,
  provider text,
  provider_event_id text,
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
    RAISE EXCEPTION 'Invalid webhook claim limit.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT i.id
    FROM public.commerce_webhook_inbox i
    WHERE (
      (
        i.status IN ('pending', 'retry')
        AND (i.next_attempt_at IS NULL OR i.next_attempt_at <= clock_timestamp())
      ) OR (
        i.status = 'processing'
        AND i.next_attempt_at IS NOT NULL
        AND i.next_attempt_at <= clock_timestamp()
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.commerce_payment_events e
      JOIN public.commerce_wallet_topup_checkouts c
        ON c.provider = e.provider
       AND (
         c.provider_payment_id = e.provider_payment_id
         OR (
           CASE WHEN (e.payload->>'orderCode') ~ '^[0-9]+$'
             THEN (e.payload->>'orderCode')::bigint
           END
         ) = c.provider_order_code
       )
      WHERE e.provider = i.provider
        AND e.provider_event_id = i.provider_event_id
    )
    ORDER BY i.received_at, i.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.commerce_webhook_inbox i
  SET status = 'processing', attempts = i.attempts + 1,
      processing_token = gen_random_uuid(),
      next_attempt_at = clock_timestamp() + interval '2 minutes',
      last_error_code = NULL
  FROM candidates c
  WHERE i.id = c.id
  RETURNING i.id, i.processing_token, i.provider, i.provider_event_id, i.attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_claim_wallet_payment_webhooks(
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  webhook_inbox_id uuid,
  processing_token uuid,
  provider text,
  provider_event_id text,
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
    RAISE EXCEPTION 'Invalid Wallet webhook claim limit.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT i.id
    FROM public.commerce_webhook_inbox i
    JOIN public.commerce_payment_events e
      ON e.provider = i.provider AND e.provider_event_id = i.provider_event_id
    WHERE (
      (
        i.status IN ('pending', 'retry')
        AND (i.next_attempt_at IS NULL OR i.next_attempt_at <= clock_timestamp())
      ) OR (
        i.status = 'processing'
        AND i.next_attempt_at IS NOT NULL
        AND i.next_attempt_at <= clock_timestamp()
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.commerce_wallet_topup_checkouts c
      WHERE c.provider = e.provider
        AND (
          c.provider_payment_id = e.provider_payment_id
          OR (
            CASE WHEN (e.payload->>'orderCode') ~ '^[0-9]+$'
              THEN (e.payload->>'orderCode')::bigint
            END
          ) = c.provider_order_code
        )
    )
    ORDER BY i.received_at, i.id
    FOR UPDATE OF i SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.commerce_webhook_inbox i
  SET status = 'processing', attempts = i.attempts + 1,
      processing_token = gen_random_uuid(),
      next_attempt_at = clock_timestamp() + interval '2 minutes',
      last_error_code = NULL
  FROM candidates c
  WHERE i.id = c.id
  RETURNING i.id, i.processing_token, i.provider, i.provider_event_id, i.attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_claim_payment_webhooks(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_claim_wallet_payment_webhooks(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_claim_payment_webhooks(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_claim_wallet_payment_webhooks(integer) TO service_role;
CREATE OR REPLACE FUNCTION public.commerce_process_wallet_payment_webhook(
  p_webhook_inbox_id uuid,
  p_processing_token uuid
)
RETURNS TABLE(
  webhook_inbox_id uuid,
  topup_checkout_id uuid,
  outcome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inbox public.commerce_webhook_inbox%ROWTYPE;
  v_event public.commerce_payment_events%ROWTYPE;
  v_checkout public.commerce_wallet_topup_checkouts%ROWTYPE;
  v_intent public.commerce_wallet_topup_intents%ROWTYPE;
  v_credit jsonb;
  v_order_code bigint;
  v_outcome text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_inbox FROM public.commerce_webhook_inbox i WHERE i.id = p_webhook_inbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Webhook inbox not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_inbox.status = 'processed' THEN
    RETURN QUERY SELECT v_inbox.id, NULL::uuid, 'already_processed'::text;
    RETURN;
  END IF;
  IF v_inbox.status <> 'processing' OR v_inbox.processing_token IS DISTINCT FROM p_processing_token THEN
    RAISE EXCEPTION 'Webhook claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_event
  FROM public.commerce_payment_events e
  WHERE e.provider = v_inbox.provider AND e.provider_event_id = v_inbox.provider_event_id
  FOR UPDATE;
  IF NOT FOUND OR v_event.verification_method <> v_inbox.verification_method
     OR v_event.signed_data_hash IS DISTINCT FROM v_inbox.signed_data_hash
     OR v_event.provider_lookup_hash IS DISTINCT FROM v_inbox.provider_lookup_hash THEN
    RAISE EXCEPTION 'Wallet webhook inbox and event are inconsistent.' USING ERRCODE = '23514';
  END IF;
  IF v_event.event_type NOT IN ('payment.succeeded','payment.failed')
     OR v_event.amount_minor IS NULL OR v_event.currency <> 'VND' THEN
    RAISE EXCEPTION 'Invalid Wallet payment event.' USING ERRCODE = '22023';
  END IF;

  IF (v_event.payload->>'orderCode') ~ '^[0-9]+$' THEN
    v_order_code := (v_event.payload->>'orderCode')::bigint;
  END IF;

  SELECT * INTO v_checkout
  FROM public.commerce_wallet_topup_checkouts c
  WHERE c.provider = v_event.provider
    AND (
      c.provider_payment_id = v_event.provider_payment_id
      OR (v_order_code IS NOT NULL AND c.provider_order_code = v_order_code)
    )
  ORDER BY (c.provider_payment_id = v_event.provider_payment_id) DESC, c.created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment event is not attached to a wallet top-up checkout.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_intent
  FROM public.commerce_wallet_topup_intents i
  WHERE i.id = v_checkout.topup_intent_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet top-up intent not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_event.amount_minor <> v_checkout.amount_minor OR v_event.currency <> v_checkout.currency THEN
    RAISE EXCEPTION 'Wallet payment amount does not match checkout snapshot.' USING ERRCODE = '22023';
  END IF;

  IF v_checkout.provider_payment_id IS NULL THEN
    PERFORM public.commerce_attach_wallet_topup_payment(v_checkout.topup_intent_id, v_checkout.provider, v_event.provider_payment_id);
    UPDATE public.commerce_wallet_topup_checkouts c
    SET provider_payment_id = v_event.provider_payment_id,
        status = CASE WHEN c.status = 'creating' THEN 'pending' ELSE c.status END,
        updated_at = clock_timestamp()
    WHERE c.id = v_checkout.id;
  ELSIF v_checkout.provider_payment_id IS DISTINCT FROM v_event.provider_payment_id THEN
    RAISE EXCEPTION 'Wallet provider payment identity conflicts with checkout.' USING ERRCODE = '23514';
  END IF;

  IF v_event.event_type = 'payment.failed' THEN
    IF v_intent.status = 'credited' THEN
      v_outcome := 'topup_failure_ignored_after_credit';
      UPDATE public.commerce_wallet_topup_checkouts SET status = 'succeeded', updated_at = clock_timestamp() WHERE id = v_checkout.id;
    ELSIF v_intent.status IN ('draft','awaiting_payment') THEN
      UPDATE public.commerce_wallet_topup_intents
      SET status = 'failed', failed_at = COALESCE(failed_at, v_event.occurred_at, clock_timestamp()), updated_at = clock_timestamp()
      WHERE id = v_intent.id;
      UPDATE public.commerce_wallet_topup_checkouts
      SET status = 'failed', recovery_error_code = 'provider_payment_failed', updated_at = clock_timestamp()
      WHERE id = v_checkout.id;
      v_outcome := 'topup_failed';
    ELSE
      v_outcome := 'topup_failure_review_required';
    END IF;
  ELSIF v_intent.status IN ('draft','awaiting_payment') THEN
    SELECT public.commerce_credit_wallet_topup(
      v_intent.id,
      v_event.amount_minor,
      v_event.currency,
      v_event.provider_event_id,
      v_event.provider_payment_id,
      'wallet-credit:event:' || v_event.id::text
    ) INTO v_credit;
    UPDATE public.commerce_wallet_topup_checkouts
    SET status = 'succeeded', claim_token = NULL, claim_expires_at = NULL,
        recovery_error_code = NULL, updated_at = clock_timestamp()
    WHERE id = v_checkout.id;
    v_outcome := 'topup_credited';
  ELSIF v_intent.status = 'credited' THEN
    UPDATE public.commerce_wallet_topup_checkouts
    SET status = 'succeeded', claim_token = NULL, claim_expires_at = NULL, updated_at = clock_timestamp()
    WHERE id = v_checkout.id;
    v_outcome := 'topup_already_credited';
  ELSE
    UPDATE public.commerce_wallet_topup_checkouts
    SET status = 'recovery_required', recovery_error_code = 'late_success_requires_review', updated_at = clock_timestamp()
    WHERE id = v_checkout.id;
    v_outcome := 'topup_review_required';
  END IF;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_role, entity_type, entity_id, event_type, correlation_id, after_state
  ) VALUES (
    v_intent.owner_user_id, 'provider', 'wallet_topup_checkout', v_checkout.id,
    'wallet_payment_webhook_processed', v_event.provider_event_id,
    jsonb_build_object('outcome', v_outcome, 'event_type', v_event.event_type, 'payment_event_id', v_event.id)
  );

  UPDATE public.commerce_webhook_inbox
  SET status = 'processed', processed_at = clock_timestamp(), processing_token = NULL,
      next_attempt_at = NULL, last_error_code = NULL
  WHERE id = v_inbox.id;

  RETURN QUERY SELECT v_inbox.id, v_checkout.id, v_outcome;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_process_wallet_payment_webhook(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_claim_wallet_topup_reconciliations(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_complete_wallet_topup_reconciliation(uuid, uuid, text, text, bigint, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_fail_wallet_topup_reconciliation(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_process_wallet_payment_webhook(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_claim_wallet_topup_reconciliations(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_complete_wallet_topup_reconciliation(uuid, uuid, text, text, bigint, text, text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_fail_wallet_topup_reconciliation(uuid, uuid, text, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
