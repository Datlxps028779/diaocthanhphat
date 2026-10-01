-- =============================================================================
-- Commerce wallet top-up checkout boundary
-- Durable, server-priced checkout state without changing order payment attempts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.commerce_wallet_topup_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topup_intent_id uuid NOT NULL UNIQUE REFERENCES public.commerce_wallet_topup_intents(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9_-]{2,40}$'),
  provider_order_code bigint NOT NULL UNIQUE CHECK (provider_order_code BETWEEN 1 AND 9007199254740991),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  status text NOT NULL DEFAULT 'created' CHECK (status IN (
    'created','creating','pending','recovery_required','succeeded','failed','cancelled','expired'
  )),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  provider_payment_id text,
  checkout_url text,
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  claim_token text,
  claim_expires_at timestamptz,
  recovery_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, idempotency_key),
  CHECK ((claim_token IS NULL) = (claim_expires_at IS NULL)),
  CHECK (checkout_url IS NULL OR (char_length(checkout_url) <= 2000 AND checkout_url ~ '^https://'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_wallet_topup_checkout_provider_payment
  ON public.commerce_wallet_topup_checkouts(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_wallet_topup_checkout_owner
  ON public.commerce_wallet_topup_checkouts(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_wallet_topup_checkout_recovery
  ON public.commerce_wallet_topup_checkouts(status, updated_at)
  WHERE status IN ('creating','pending','recovery_required');

ALTER TABLE public.commerce_wallet_topup_checkouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commerce_wallet_topup_checkouts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.commerce_start_wallet_topup_checkout(
  p_topup_intent_id uuid,
  p_provider text,
  p_idempotency_key text
)
RETURNS TABLE(
  topup_checkout_id uuid,
  topup_intent_id uuid,
  provider_order_code bigint,
  amount_minor bigint,
  currency text,
  checkout_status text,
  checkout_expires_at timestamptz,
  provider_payment_id text,
  checkout_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_intent public.commerce_wallet_topup_intents%ROWTYPE;
  v_checkout public.commerce_wallet_topup_checkouts%ROWTYPE;
  v_sequence text;
  v_order_code bigint;
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

  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text, 141600));

  SELECT * INTO v_intent
  FROM public.commerce_wallet_topup_intents i
  WHERE i.id = p_topup_intent_id
    AND i.owner_user_id = v_actor
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owned wallet top-up intent not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_checkout
  FROM public.commerce_wallet_topup_checkouts c
  WHERE c.topup_intent_id = v_intent.id
  FOR UPDATE;
  IF FOUND THEN
    IF v_checkout.provider <> p_provider THEN
      RAISE EXCEPTION 'Wallet top-up intent is linked to another provider.' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT
      v_checkout.id, v_checkout.topup_intent_id, v_checkout.provider_order_code,
      v_checkout.amount_minor, v_checkout.currency, v_checkout.status, v_checkout.expires_at,
      v_checkout.provider_payment_id, v_checkout.checkout_url;
    RETURN;
  END IF;

  SELECT * INTO v_checkout
  FROM public.commerce_wallet_topup_checkouts c
  WHERE c.owner_user_id = v_actor AND c.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'Idempotency key was used for another wallet top-up checkout.' USING ERRCODE = '22023';
  END IF;

  IF v_intent.status NOT IN ('draft','awaiting_payment') THEN
    RAISE EXCEPTION 'Wallet top-up intent cannot start checkout.' USING ERRCODE = 'P0001';
  END IF;
  IF (
    SELECT count(*)
    FROM public.commerce_wallet_topup_checkouts c
    WHERE c.owner_user_id = v_actor
      AND c.created_at > clock_timestamp() - interval '1 hour'
  ) >= 20 THEN
    RAISE EXCEPTION 'Wallet top-up checkout rate limit exceeded.' USING ERRCODE = 'P0001';
  END IF;

  v_sequence := pg_get_serial_sequence('public.commerce_payment_attempts', 'provider_order_code');
  IF v_sequence IS NULL THEN
    RAISE EXCEPTION 'Commerce provider order code sequence is unavailable.' USING ERRCODE = '55000';
  END IF;
  v_order_code := nextval(v_sequence::regclass);
  IF v_order_code NOT BETWEEN 1 AND 9007199254740991 THEN
    RAISE EXCEPTION 'Commerce provider order code is outside the safe range.' USING ERRCODE = '22003';
  END IF;

  INSERT INTO public.commerce_wallet_topup_checkouts(
    topup_intent_id, owner_user_id, provider, provider_order_code,
    amount_minor, currency, status, idempotency_key, expires_at
  ) VALUES (
    v_intent.id, v_actor, p_provider, v_order_code,
    v_intent.requested_amount_minor, v_intent.currency, 'created', p_idempotency_key,
    date_trunc('second', clock_timestamp() + interval '15 minutes')
  ) RETURNING * INTO v_checkout;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    v_actor, v_actor, 'owner', 'wallet_topup_checkout', v_checkout.id,
    'wallet_topup_checkout_created', p_idempotency_key,
    jsonb_build_object(
      'topup_intent_id', v_intent.id,
      'provider', v_checkout.provider,
      'provider_order_code', v_checkout.provider_order_code,
      'amount_minor', v_checkout.amount_minor,
      'currency', v_checkout.currency,
      'status', v_checkout.status
    )
  );

  RETURN QUERY SELECT
    v_checkout.id, v_checkout.topup_intent_id, v_checkout.provider_order_code,
    v_checkout.amount_minor, v_checkout.currency, v_checkout.status, v_checkout.expires_at,
    v_checkout.provider_payment_id, v_checkout.checkout_url;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_claim_wallet_topup_checkout(
  p_topup_checkout_id uuid,
  p_claim_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_checkout public.commerce_wallet_topup_checkouts%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_claim_token IS NULL OR p_claim_token !~ '^[A-Za-z0-9_-]{16,80}$' THEN
    RAISE EXCEPTION 'Invalid checkout claim token.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_checkout
  FROM public.commerce_wallet_topup_checkouts c
  WHERE c.id = p_topup_checkout_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet top-up checkout not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_checkout.provider_payment_id IS NOT NULL
     OR v_checkout.status NOT IN ('created','creating','recovery_required') THEN
    RETURN false;
  END IF;
  IF v_checkout.claim_token = p_claim_token AND v_checkout.claim_expires_at > v_now THEN
    RETURN true;
  END IF;
  IF v_checkout.claim_expires_at > v_now THEN
    RETURN false;
  END IF;

  UPDATE public.commerce_wallet_topup_checkouts
  SET status = 'creating',
      claim_token = p_claim_token,
      claim_expires_at = clock_timestamp() + interval '60 seconds',
      updated_at = clock_timestamp()
  WHERE id = v_checkout.id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_attach_wallet_topup_checkout(
  p_topup_checkout_id uuid,
  p_claim_token text,
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
  v_intent_id uuid;
  v_checkout public.commerce_wallet_topup_checkouts%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_claim_token IS NULL OR p_claim_token !~ '^[A-Za-z0-9_-]{16,80}$'
     OR p_provider_payment_id IS NULL OR char_length(btrim(p_provider_payment_id)) NOT BETWEEN 1 AND 160
     OR p_checkout_url IS NULL OR char_length(p_checkout_url) > 2000 OR p_checkout_url !~ '^https://'
     OR p_expires_at IS NULL OR p_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid wallet top-up checkout attachment.' USING ERRCODE = '22023';
  END IF;

  SELECT topup_intent_id INTO v_intent_id
  FROM public.commerce_wallet_topup_checkouts
  WHERE id = p_topup_checkout_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet top-up checkout not found.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.commerce_wallet_topup_intents WHERE id = v_intent_id FOR UPDATE;

  SELECT * INTO v_checkout
  FROM public.commerce_wallet_topup_checkouts c
  WHERE c.id = p_topup_checkout_id
  FOR UPDATE;
  IF v_checkout.provider_payment_id = btrim(p_provider_payment_id)
     AND v_checkout.checkout_url = p_checkout_url
     AND v_checkout.expires_at = p_expires_at THEN
    RETURN v_checkout.id;
  END IF;
  IF v_checkout.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'Wallet top-up checkout claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;
  IF v_checkout.provider_payment_id IS NOT NULL
     AND v_checkout.provider_payment_id <> btrim(p_provider_payment_id) THEN
    RAISE EXCEPTION 'Wallet top-up checkout is linked to another provider payment.' USING ERRCODE = '23505';
  END IF;
  IF v_checkout.status <> 'creating' THEN
    RAISE EXCEPTION 'Wallet top-up checkout cannot attach provider payment.' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.commerce_attach_wallet_topup_payment(
    v_checkout.topup_intent_id,
    v_checkout.provider,
    btrim(p_provider_payment_id)
  );

  UPDATE public.commerce_wallet_topup_checkouts
  SET provider_payment_id = btrim(p_provider_payment_id),
      checkout_url = p_checkout_url,
      expires_at = p_expires_at,
      status = 'pending',
      claim_token = NULL,
      claim_expires_at = NULL,
      recovery_error_code = NULL,
      updated_at = clock_timestamp()
  WHERE id = v_checkout.id;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    v_checkout.owner_user_id, 'system', 'wallet_topup_checkout', v_checkout.id,
    'wallet_topup_checkout_attached', v_checkout.idempotency_key,
    jsonb_build_object(
      'provider', v_checkout.provider,
      'provider_payment_id', btrim(p_provider_payment_id),
      'provider_order_code', v_checkout.provider_order_code,
      'status', 'pending',
      'expires_at', p_expires_at
    )
  );

  RETURN v_checkout.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_recover_wallet_topup_checkout(
  p_topup_checkout_id uuid,
  p_claim_token text,
  p_provider_payment_id text,
  p_error_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intent_id uuid;
  v_checkout public.commerce_wallet_topup_checkouts%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_claim_token IS NULL OR p_claim_token !~ '^[A-Za-z0-9_-]{16,80}$'
     OR (p_provider_payment_id IS NOT NULL AND char_length(btrim(p_provider_payment_id)) NOT BETWEEN 1 AND 160)
     OR p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_:-]{2,80}$' THEN
    RAISE EXCEPTION 'Invalid wallet top-up recovery state.' USING ERRCODE = '22023';
  END IF;

  SELECT topup_intent_id INTO v_intent_id
  FROM public.commerce_wallet_topup_checkouts
  WHERE id = p_topup_checkout_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet top-up checkout not found.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.commerce_wallet_topup_intents WHERE id = v_intent_id FOR UPDATE;

  SELECT * INTO v_checkout
  FROM public.commerce_wallet_topup_checkouts c
  WHERE c.id = p_topup_checkout_id
  FOR UPDATE;
  IF v_checkout.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'Wallet top-up checkout claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;
  IF v_checkout.provider_payment_id IS NOT NULL
     AND v_checkout.provider_payment_id IS DISTINCT FROM NULLIF(btrim(p_provider_payment_id), '') THEN
    RAISE EXCEPTION 'Wallet top-up recovery conflicts with provider payment.' USING ERRCODE = '23505';
  END IF;
  IF v_checkout.status <> 'creating' THEN
    RAISE EXCEPTION 'Wallet top-up checkout cannot enter recovery.' USING ERRCODE = 'P0001';
  END IF;

  IF p_provider_payment_id IS NOT NULL THEN
    PERFORM public.commerce_attach_wallet_topup_payment(
      v_checkout.topup_intent_id,
      v_checkout.provider,
      btrim(p_provider_payment_id)
    );
  END IF;

  UPDATE public.commerce_wallet_topup_checkouts
  SET provider_payment_id = COALESCE(provider_payment_id, NULLIF(btrim(p_provider_payment_id), '')),
      status = 'recovery_required',
      claim_token = NULL,
      claim_expires_at = NULL,
      recovery_error_code = p_error_code,
      updated_at = clock_timestamp()
  WHERE id = v_checkout.id;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    v_checkout.owner_user_id, 'system', 'wallet_topup_checkout', v_checkout.id,
    'wallet_topup_checkout_recovery_required', v_checkout.idempotency_key,
    jsonb_build_object(
      'provider', v_checkout.provider,
      'provider_payment_id', p_provider_payment_id,
      'provider_order_code', v_checkout.provider_order_code,
      'error_code', p_error_code
    )
  );

  RETURN v_checkout.id;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_start_wallet_topup_checkout(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_claim_wallet_topup_checkout(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_attach_wallet_topup_checkout(uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_recover_wallet_topup_checkout(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.commerce_start_wallet_topup_checkout(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_claim_wallet_topup_checkout(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_attach_wallet_topup_checkout(uuid, text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_recover_wallet_topup_checkout(uuid, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
