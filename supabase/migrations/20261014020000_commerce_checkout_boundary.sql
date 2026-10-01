-- =============================================================================
-- Commerce checkout boundary: durable payment attempts before provider calls
-- Additive only. Production execution is user-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.commerce_start_payment_attempt(
  p_order_id uuid,
  p_provider text,
  p_idempotency_key text
)
RETURNS TABLE(
  payment_attempt_id uuid,
  provider_order_code bigint,
  order_number bigint,
  amount_minor bigint,
  currency text,
  attempt_status text,
  attempt_expires_at timestamptz,
  provider_payment_id text,
  checkout_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_order public.commerce_orders%ROWTYPE;
  v_attempt public.commerce_payment_attempts%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_provider IS NULL OR p_provider !~ '^[a-z0-9_-]{2,40}$' THEN
    RAISE EXCEPTION 'Invalid payment provider.' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 160 THEN
    RAISE EXCEPTION 'Invalid idempotency key.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text, 140200));

  SELECT * INTO v_order
  FROM public.commerce_orders
  WHERE id = p_order_id
    AND owner_user_id = v_actor
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owned order not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_attempt
  FROM public.commerce_payment_attempts
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_attempt.order_id <> v_order.id OR v_attempt.provider <> p_provider THEN
      RAISE EXCEPTION 'Idempotency key was already used for another payment attempt.' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT
      v_attempt.id, v_attempt.provider_order_code, v_order.order_number,
      v_attempt.amount_minor, v_attempt.currency, v_attempt.status, v_attempt.expires_at,
      v_attempt.provider_payment_id, v_attempt.checkout_url;
    RETURN;
  END IF;

  IF (
    SELECT count(*)
    FROM public.commerce_payment_attempts a
    JOIN public.commerce_orders o ON o.id = a.order_id
    WHERE o.owner_user_id = v_actor
      AND a.created_at > now() - interval '1 hour'
  ) >= 20 THEN
    RAISE EXCEPTION 'Payment attempt rate limit exceeded.' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.status NOT IN ('draft', 'payment_failed', 'awaiting_payment') THEN
    RAISE EXCEPTION 'Order cannot start a payment attempt.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.commerce_payment_attempts a
    WHERE a.order_id = v_order.id
      AND a.status IN ('created', 'pending')
      AND (a.expires_at IS NULL OR a.expires_at > now())
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Order already has an active payment attempt.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.commerce_payment_attempts (
    order_id, provider, status, amount_minor, currency, idempotency_key, expires_at
  ) VALUES (
    v_order.id, p_provider, 'created', v_order.total_minor, v_order.currency, p_idempotency_key,
    date_trunc('second', now() + interval '15 minutes')
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_attempt;

  IF NOT FOUND THEN
    SELECT * INTO v_attempt
    FROM public.commerce_payment_attempts
    WHERE idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF NOT FOUND OR v_attempt.order_id <> v_order.id OR v_attempt.provider <> p_provider THEN
      RAISE EXCEPTION 'Concurrent payment idempotency conflict.' USING ERRCODE = '40001';
    END IF;
  ELSE
    UPDATE public.commerce_orders
    SET status = 'awaiting_payment', updated_at = now()
    WHERE id = v_order.id
      AND status IN ('draft', 'payment_failed');

    INSERT INTO public.commerce_audit_events (
      owner_user_id, actor_id, actor_role, entity_type, entity_id,
      event_type, correlation_id, after_state
    ) VALUES (
      v_actor, v_actor, 'owner', 'payment_attempt', v_attempt.id,
      'payment_attempt_created', p_idempotency_key,
      jsonb_build_object(
        'order_id', v_order.id,
        'provider', v_attempt.provider,
        'provider_order_code', v_attempt.provider_order_code,
        'amount_minor', v_attempt.amount_minor,
        'currency', v_attempt.currency,
        'status', v_attempt.status
      )
    );
  END IF;

  RETURN QUERY SELECT
    v_attempt.id, v_attempt.provider_order_code, v_order.order_number,
    v_attempt.amount_minor, v_attempt.currency, v_attempt.status, v_attempt.expires_at,
    v_attempt.provider_payment_id, v_attempt.checkout_url;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_claim_payment_checkout(
  p_payment_attempt_id uuid,
  p_claim_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_order public.commerce_orders%ROWTYPE;
  v_attempt public.commerce_payment_attempts%ROWTYPE;
  v_claimed_at timestamptz;
  v_claim_now timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_claim_token IS NULL OR p_claim_token !~ '^[A-Za-z0-9_-]{16,80}$' THEN
    RAISE EXCEPTION 'Invalid checkout claim token.' USING ERRCODE = '22023';
  END IF;

  SELECT order_id INTO v_order_id
  FROM public.commerce_payment_attempts
  WHERE id = p_payment_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment attempt not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.commerce_orders
  WHERE id = v_order_id
  FOR UPDATE;

  SELECT * INTO v_attempt
  FROM public.commerce_payment_attempts
  WHERE id = p_payment_attempt_id
    AND order_id = v_order.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment attempt changed concurrently.' USING ERRCODE = '40001';
  END IF;
  IF v_attempt.provider_payment_id IS NOT NULL OR v_attempt.status <> 'created' THEN
    RETURN false;
  END IF;

  v_claim_now := clock_timestamp();

  BEGIN
    v_claimed_at := NULLIF(v_attempt.provider_metadata->>'checkout_claimed_at', '')::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Stored checkout claim timestamp is invalid.' USING ERRCODE = '22007';
  END;

  IF v_attempt.provider_metadata->>'checkout_claim_token' = p_claim_token THEN
    RETURN true;
  END IF;
  IF v_claimed_at IS NOT NULL AND v_claimed_at > v_claim_now - interval '60 seconds' THEN
    RETURN false;
  END IF;

  UPDATE public.commerce_payment_attempts
  SET provider_metadata = provider_metadata || jsonb_build_object(
        'checkout_claim_token', p_claim_token,
        'checkout_claimed_at', v_claim_now
      ),
      updated_at = now()
  WHERE id = v_attempt.id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_attach_payment_checkout(
  p_payment_attempt_id uuid,
  p_provider_payment_id text,
  p_checkout_url text,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_order public.commerce_orders%ROWTYPE;
  v_attempt public.commerce_payment_attempts%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_provider_payment_id IS NULL OR char_length(btrim(p_provider_payment_id)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid provider payment id.' USING ERRCODE = '22023';
  END IF;
  IF p_checkout_url IS NOT NULL AND (
    char_length(p_checkout_url) > 2000 OR p_checkout_url !~ '^https://'
  ) THEN
    RAISE EXCEPTION 'Invalid checkout URL.' USING ERRCODE = '22023';
  END IF;
  SELECT order_id INTO v_order_id
  FROM public.commerce_payment_attempts
  WHERE id = p_payment_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment attempt not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.commerce_orders
  WHERE id = v_order_id
  FOR UPDATE;

  SELECT * INTO v_attempt
  FROM public.commerce_payment_attempts
  WHERE id = p_payment_attempt_id
    AND order_id = v_order.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment attempt changed concurrently.' USING ERRCODE = '40001';
  END IF;
  IF v_attempt.provider_payment_id IS NOT NULL
     AND v_attempt.provider_payment_id <> btrim(p_provider_payment_id) THEN
    RAISE EXCEPTION 'Payment attempt is already linked to another provider payment.' USING ERRCODE = '23505';
  END IF;
  IF v_attempt.provider_payment_id = btrim(p_provider_payment_id) THEN
    IF v_attempt.checkout_url IS NOT NULL
       AND p_checkout_url IS NOT NULL
       AND v_attempt.checkout_url <> p_checkout_url THEN
      RAISE EXCEPTION 'Checkout URL conflicts with the attached provider payment.' USING ERRCODE = '22023';
    END IF;
    IF v_attempt.expires_at IS NOT NULL
       AND p_expires_at IS NOT NULL
       AND v_attempt.expires_at <> p_expires_at THEN
      RAISE EXCEPTION 'Checkout expiry conflicts with the attached provider payment.' USING ERRCODE = '22023';
    END IF;
    IF (v_attempt.checkout_url IS NOT NULL OR p_checkout_url IS NULL)
       AND (v_attempt.expires_at IS NOT NULL OR p_expires_at IS NULL) THEN
      RETURN v_attempt.id;
    END IF;
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'Checkout expiry must be in the future.' USING ERRCODE = '22023';
  END IF;
  IF v_attempt.status NOT IN ('created', 'pending') THEN
    RAISE EXCEPTION 'Payment attempt cannot attach checkout.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.commerce_payment_attempts
  SET provider_payment_id = btrim(p_provider_payment_id),
      checkout_url = COALESCE(checkout_url, p_checkout_url),
      expires_at = COALESCE(expires_at, p_expires_at),
      provider_metadata = provider_metadata - 'checkout_claim_token' - 'checkout_claimed_at',
      status = 'pending',
      updated_at = now()
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;

  UPDATE public.commerce_orders
  SET status = 'awaiting_payment', updated_at = now()
  WHERE id = v_order.id
    AND status IN ('draft', 'payment_failed');

  INSERT INTO public.commerce_audit_events (
    owner_user_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    v_order.owner_user_id, 'system', 'payment_attempt', v_attempt.id,
    'payment_checkout_attached', v_attempt.idempotency_key,
    jsonb_build_object(
      'provider', v_attempt.provider,
      'provider_payment_id', v_attempt.provider_payment_id,
      'provider_order_code', v_attempt.provider_order_code,
      'status', v_attempt.status,
      'expires_at', v_attempt.expires_at
    )
  );

  RETURN v_attempt.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_fail_payment_attempt(
  p_payment_attempt_id uuid,
  p_error_code text,
  p_claim_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_order public.commerce_orders%ROWTYPE;
  v_attempt public.commerce_payment_attempts%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_:-]{2,80}$' THEN
    RAISE EXCEPTION 'Invalid payment error code.' USING ERRCODE = '22023';
  END IF;
  IF p_claim_token IS NULL OR p_claim_token !~ '^[A-Za-z0-9_-]{16,80}$' THEN
    RAISE EXCEPTION 'Invalid checkout claim token.' USING ERRCODE = '22023';
  END IF;

  SELECT order_id INTO v_order_id
  FROM public.commerce_payment_attempts
  WHERE id = p_payment_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment attempt not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.commerce_orders
  WHERE id = v_order_id
  FOR UPDATE;

  SELECT * INTO v_attempt
  FROM public.commerce_payment_attempts
  WHERE id = p_payment_attempt_id
    AND order_id = v_order.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment attempt changed concurrently.' USING ERRCODE = '40001';
  END IF;
  IF v_attempt.provider_metadata->>'checkout_claim_token' IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'Checkout claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.status = 'failed'
     AND v_attempt.provider_metadata->>'checkout_error_code' = p_error_code THEN
    RETURN v_attempt.id;
  END IF;
  IF v_attempt.status <> 'created' OR v_attempt.provider_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only an unattached checkout creation attempt can be marked failed.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.commerce_payment_attempts
  SET status = 'failed',
      failed_at = now(),
      provider_metadata = provider_metadata || jsonb_build_object('checkout_error_code', p_error_code),
      updated_at = now()
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;

  UPDATE public.commerce_orders o
  SET status = 'payment_failed', updated_at = now()
  WHERE o.id = v_order.id
    AND o.status = 'awaiting_payment'
    AND NOT EXISTS (
      SELECT 1 FROM public.commerce_payment_attempts a
      WHERE a.order_id = o.id
        AND a.status IN ('created', 'pending')
        AND (a.expires_at IS NULL OR a.expires_at > now())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.commerce_payment_attempts a
      WHERE a.order_id = o.id
        AND a.status IN ('succeeded', 'partially_refunded', 'refunded', 'chargeback')
    );

  INSERT INTO public.commerce_audit_events (
    owner_user_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    v_order.owner_user_id, 'system', 'payment_attempt', v_attempt.id,
    'payment_attempt_failed', v_attempt.idempotency_key,
    jsonb_build_object('status', v_attempt.status, 'error_code', p_error_code)
  );

  RETURN v_attempt.id;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_start_payment_attempt(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_claim_payment_checkout(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_attach_payment_checkout(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_fail_payment_attempt(uuid, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.commerce_start_payment_attempt(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_claim_payment_checkout(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_attach_payment_checkout(uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_fail_payment_attempt(uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
