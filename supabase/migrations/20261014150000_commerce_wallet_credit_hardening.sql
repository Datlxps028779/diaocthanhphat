-- =============================================================================
-- Commerce wallet credit hardening
-- One verified top-up intent may increase wallet balance exactly once.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_wallet_ledger_topup_intent
  ON public.commerce_wallet_ledger(topup_intent_id)
  WHERE operation = 'topup_credit';

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_wallet_receipts_topup_intent
  ON public.commerce_wallet_receipts(topup_intent_id)
  WHERE receipt_kind = 'wallet_topup';

CREATE OR REPLACE FUNCTION public.commerce_attach_wallet_topup_payment(
  p_topup_intent_id uuid,
  p_provider text,
  p_provider_payment_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intent public.commerce_wallet_topup_intents%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_provider IS NULL OR p_provider !~ '^[a-z0-9_-]{2,40}$'
     OR p_provider_payment_id IS NULL OR char_length(btrim(p_provider_payment_id)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid provider payment identity.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_intent
  FROM public.commerce_wallet_topup_intents i
  WHERE i.id = p_topup_intent_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet top-up intent not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_intent.provider_payment_id IS NOT NULL
     AND (v_intent.provider <> p_provider OR v_intent.provider_payment_id <> btrim(p_provider_payment_id)) THEN
    RAISE EXCEPTION 'Wallet top-up intent is linked to another provider payment.' USING ERRCODE = '23505';
  END IF;
  IF v_intent.status = 'credited' THEN
    RETURN v_intent.id;
  END IF;
  IF v_intent.status NOT IN ('draft','awaiting_payment') THEN
    RAISE EXCEPTION 'Wallet top-up intent cannot attach payment.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.commerce_wallet_topup_intents i
  SET provider = p_provider,
      provider_payment_id = btrim(p_provider_payment_id),
      status = 'awaiting_payment',
      updated_at = clock_timestamp()
  WHERE i.id = v_intent.id;

  RETURN v_intent.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_credit_wallet_topup(
  p_topup_intent_id uuid,
  p_observed_amount_minor bigint,
  p_observed_currency text,
  p_provider_event_id text,
  p_provider_payment_id text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intent public.commerce_wallet_topup_intents%ROWTYPE;
  v_wallet public.commerce_wallet_accounts%ROWTYPE;
  v_existing public.commerce_wallet_ledger%ROWTYPE;
  v_receipt_number text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_observed_amount_minor IS NULL OR p_observed_amount_minor <= 0
     OR p_observed_currency <> 'VND'
     OR p_provider_event_id IS NULL OR char_length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 160
     OR p_provider_payment_id IS NULL OR char_length(btrim(p_provider_payment_id)) NOT BETWEEN 1 AND 160
     OR p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 160 THEN
    RAISE EXCEPTION 'Invalid verified top-up payment.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_intent
  FROM public.commerce_wallet_topup_intents i
  WHERE i.id = p_topup_intent_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet top-up intent not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_intent.provider_payment_id IS DISTINCT FROM btrim(p_provider_payment_id)
     OR v_intent.status NOT IN ('awaiting_payment','credited') THEN
    RAISE EXCEPTION 'Verified payment does not match top-up intent.' USING ERRCODE = '23514';
  END IF;
  IF v_intent.requested_amount_minor <> p_observed_amount_minor THEN
    RAISE EXCEPTION 'Provider payment amount does not match top-up intent.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.commerce_wallet_ledger l
  WHERE l.operation = 'topup_credit'
    AND l.topup_intent_id = v_intent.id
  FOR UPDATE;
  IF FOUND THEN
    IF v_intent.status <> 'credited' THEN
      RAISE EXCEPTION 'Wallet top-up credit state is inconsistent.' USING ERRCODE = '23514';
    END IF;
    IF v_existing.amount_minor <> v_intent.requested_amount_minor
       OR v_existing.currency <> v_intent.currency
       OR NOT EXISTS (
         SELECT 1 FROM public.commerce_wallet_receipts r
         WHERE r.receipt_kind = 'wallet_topup'
           AND r.topup_intent_id = v_intent.id
       ) THEN
      RAISE EXCEPTION 'Wallet top-up credit evidence is inconsistent.' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'topup_intent_id', v_intent.id,
      'status', 'credited',
      'available_minor', v_existing.available_after,
      'reserved_minor', v_existing.reserved_after,
      'duplicate', true
    );
  END IF;

  IF v_intent.status = 'credited' THEN
    RAISE EXCEPTION 'Credited wallet top-up is missing ledger evidence.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_existing
  FROM public.commerce_wallet_ledger l
  WHERE l.owner_user_id = v_intent.owner_user_id
    AND l.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'Idempotency key was used for another wallet movement.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.commerce_wallet_accounts(owner_user_id)
  VALUES (v_intent.owner_user_id)
  ON CONFLICT (owner_user_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.commerce_wallet_accounts w
  WHERE w.owner_user_id = v_intent.owner_user_id
  FOR UPDATE;

  UPDATE public.commerce_wallet_accounts w
  SET available_minor = w.available_minor + v_intent.requested_amount_minor,
      updated_at = clock_timestamp()
  WHERE w.owner_user_id = v_intent.owner_user_id
  RETURNING * INTO v_wallet;

  INSERT INTO public.commerce_wallet_ledger(
    owner_user_id, operation, amount_minor, currency,
    available_after, reserved_after, topup_intent_id,
    idempotency_key, metadata
  ) VALUES (
    v_intent.owner_user_id, 'topup_credit', v_intent.requested_amount_minor, 'VND',
    v_wallet.available_minor, v_wallet.reserved_minor, v_intent.id,
    p_idempotency_key,
    jsonb_build_object('provider_event_id', btrim(p_provider_event_id), 'provider', v_intent.provider)
  );

  UPDATE public.commerce_wallet_topup_intents i
  SET status = 'credited',
      credited_at = COALESCE(i.credited_at, clock_timestamp()),
      updated_at = clock_timestamp()
  WHERE i.id = v_intent.id;

  v_receipt_number := 'WALLET-' || replace(v_intent.id::text, '-', '');
  INSERT INTO public.commerce_wallet_receipts(
    owner_user_id, receipt_number, receipt_kind, document_type,
    status, amount_minor, currency, topup_intent_id, snapshot
  ) VALUES (
    v_intent.owner_user_id, v_receipt_number, 'wallet_topup', 'internal_receipt',
    'issued', v_intent.requested_amount_minor, 'VND', v_intent.id,
    jsonb_build_object(
      'amount_minor', v_intent.requested_amount_minor,
      'currency', 'VND',
      'source_kind', v_intent.source_kind,
      'option_code', v_intent.option_code
    )
  );

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    v_intent.owner_user_id, 'provider', 'wallet_topup_intent', v_intent.id,
    'wallet_topup_credited', btrim(p_provider_event_id),
    jsonb_build_object(
      'amount_minor', v_intent.requested_amount_minor,
      'available_minor', v_wallet.available_minor,
      'reserved_minor', v_wallet.reserved_minor
    )
  );

  RETURN jsonb_build_object(
    'topup_intent_id', v_intent.id,
    'status', 'credited',
    'available_minor', v_wallet.available_minor,
    'reserved_minor', v_wallet.reserved_minor,
    'duplicate', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_attach_wallet_topup_payment(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_credit_wallet_topup(uuid, bigint, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_attach_wallet_topup_payment(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_credit_wallet_topup(uuid, bigint, text, text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
