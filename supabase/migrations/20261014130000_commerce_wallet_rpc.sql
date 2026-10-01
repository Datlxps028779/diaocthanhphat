-- =============================================================================
-- Commerce prepaid wallet RPCs: server-priced top-up and atomic credit
-- =============================================================================

CREATE OR REPLACE FUNCTION public.commerce_get_wallet_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'config', (
      SELECT CASE WHEN c.is_active THEN jsonb_build_object(
        'custom_amount_enabled', c.custom_amount_enabled,
        'custom_min_minor', c.custom_min_minor,
        'custom_max_minor', c.custom_max_minor,
        'custom_step_minor', c.custom_step_minor,
        'currency', 'VND'
      ) ELSE NULL END
      FROM public.commerce_wallet_topup_config c
      WHERE c.id = true
    ),
    'topupOptions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'code', o.code,
        'label', o.label,
        'amount_minor', o.amount_minor,
        'currency', o.currency
      ) ORDER BY o.sort_order, o.amount_minor), '[]'::jsonb)
      FROM public.commerce_wallet_topup_options o
      WHERE o.is_active = true
    ),
    'feeProducts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'code', p.code,
        'version', p.version,
        'name', p.name,
        'description', p.description,
        'product_kind', p.product_kind,
        'amount_minor', p.amount_minor,
        'currency', p.currency,
        'duration_days', p.duration_days,
        'placement_code', p.placement_code,
        'sponsored_label', p.sponsored_label,
        'terms_version', p.terms_version
      ) ORDER BY p.product_kind, p.amount_minor, p.code), '[]'::jsonb)
      FROM public.commerce_fee_products p
      WHERE p.is_active = true
        AND (p.valid_from IS NULL OR p.valid_from <= now())
        AND (p.valid_until IS NULL OR p.valid_until > now())
    ),
    'generatedAt', now()
  )
$$;

CREATE OR REPLACE FUNCTION public.commerce_create_wallet_topup_intent(
  p_option_code text,
  p_custom_amount_minor bigint,
  p_idempotency_key text
)
RETURNS TABLE(
  topup_intent_id uuid,
  amount_minor bigint,
  currency text,
  intent_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_config public.commerce_wallet_topup_config%ROWTYPE;
  v_option public.commerce_wallet_topup_options%ROWTYPE;
  v_intent public.commerce_wallet_topup_intents%ROWTYPE;
  v_amount bigint;
  v_source_kind text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 160 THEN
    RAISE EXCEPTION 'Invalid idempotency key.' USING ERRCODE = '22023';
  END IF;
  IF (p_option_code IS NULL) = (p_custom_amount_minor IS NULL) THEN
    RAISE EXCEPTION 'Choose exactly one top-up source.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_config
  FROM public.commerce_wallet_topup_config c
  WHERE c.id = true AND c.is_active = true
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet top-up is not available.' USING ERRCODE = 'P0001';
  END IF;

  IF p_option_code IS NOT NULL THEN
    SELECT * INTO v_option
    FROM public.commerce_wallet_topup_options o
    WHERE o.code = p_option_code AND o.is_active = true
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Top-up option is not available.' USING ERRCODE = 'P0002';
    END IF;
    v_amount := v_option.amount_minor;
    v_source_kind := 'fixed_option';
  ELSE
    IF NOT v_config.custom_amount_enabled
       OR p_custom_amount_minor < v_config.custom_min_minor
       OR p_custom_amount_minor > v_config.custom_max_minor
       OR p_custom_amount_minor % v_config.custom_step_minor <> 0 THEN
      RAISE EXCEPTION 'Custom top-up amount is outside server limits.' USING ERRCODE = '22023';
    END IF;
    v_amount := p_custom_amount_minor;
    v_source_kind := 'custom_amount';
  END IF;

  SELECT * INTO v_intent
  FROM public.commerce_wallet_topup_intents i
  WHERE i.owner_user_id = v_actor AND i.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_intent.source_kind <> v_source_kind
       OR v_intent.option_code IS DISTINCT FROM p_option_code
       OR v_intent.requested_amount_minor <> v_amount THEN
      RAISE EXCEPTION 'Idempotency key was used for another top-up request.' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_intent.id, v_intent.requested_amount_minor, v_intent.currency, v_intent.status;
    RETURN;
  END IF;

  INSERT INTO public.commerce_wallet_accounts(owner_user_id)
  VALUES (v_actor)
  ON CONFLICT (owner_user_id) DO NOTHING;

  INSERT INTO public.commerce_wallet_topup_intents(
    owner_user_id, source_kind, option_code, requested_amount_minor,
    currency, status, idempotency_key
  ) VALUES (
    v_actor, v_source_kind, p_option_code, v_amount,
    'VND', 'draft', p_idempotency_key
  ) RETURNING * INTO v_intent;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    v_actor, v_actor, 'owner', 'wallet_topup_intent', v_intent.id,
    'wallet_topup_intent_created', p_idempotency_key,
    jsonb_build_object('amount_minor', v_amount, 'currency', 'VND', 'source_kind', v_source_kind)
  );

  RETURN QUERY SELECT v_intent.id, v_intent.requested_amount_minor, v_intent.currency, v_intent.status;
END;
$$;

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
  IF v_intent.status = 'credited' THEN
    RETURN v_intent.id;
  END IF;
  IF v_intent.status NOT IN ('draft','awaiting_payment') THEN
    RAISE EXCEPTION 'Wallet top-up intent cannot attach payment.' USING ERRCODE = 'P0001';
  END IF;
  IF v_intent.provider_payment_id IS NOT NULL
     AND (v_intent.provider <> p_provider OR v_intent.provider_payment_id <> btrim(p_provider_payment_id)) THEN
    RAISE EXCEPTION 'Wallet top-up intent is linked to another provider payment.' USING ERRCODE = '23505';
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
  WHERE l.owner_user_id = v_intent.owner_user_id
    AND l.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.operation = 'topup_credit' AND v_existing.topup_intent_id = v_intent.id THEN
      RETURN jsonb_build_object(
        'topup_intent_id', v_intent.id,
        'status', 'credited',
        'available_minor', v_existing.available_after,
        'reserved_minor', v_existing.reserved_after,
        'duplicate', true
      );
    END IF;
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
  ) ON CONFLICT (owner_user_id, idempotency_key) DO NOTHING;

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
  ) ON CONFLICT (receipt_number) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.commerce_get_my_wallet_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'wallet', COALESCE((
      SELECT jsonb_build_object(
        'currency', w.currency,
        'available_minor', w.available_minor,
        'reserved_minor', w.reserved_minor,
        'updated_at', w.updated_at
      )
      FROM public.commerce_wallet_accounts w
      WHERE w.owner_user_id = v_actor
    ), jsonb_build_object('currency', 'VND', 'available_minor', 0, 'reserved_minor', 0, 'updated_at', NULL)),
    'topupIntents', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'source_kind', i.source_kind,
        'option_code', i.option_code,
        'requested_amount_minor', i.requested_amount_minor,
        'currency', i.currency,
        'status', i.status,
        'credited_at', i.credited_at,
        'created_at', i.created_at,
        'updated_at', i.updated_at
      ) ORDER BY i.created_at DESC), '[]'::jsonb)
      FROM public.commerce_wallet_topup_intents i
      WHERE i.owner_user_id = v_actor
      LIMIT 100
    ),
    'feeReservations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'user_listing_id', r.user_listing_id,
        'submission_cycle', r.submission_cycle,
        'total_minor', r.total_minor,
        'currency', r.currency,
        'status', r.status,
        'pricing_snapshot', r.pricing_snapshot,
        'expires_at', r.expires_at,
        'captured_at', r.captured_at,
        'released_at', r.released_at,
        'created_at', r.created_at
      ) ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM public.commerce_wallet_fee_reservations r
      WHERE r.owner_user_id = v_actor
      LIMIT 100
    ),
    'ledger', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id,
        'operation', l.operation,
        'amount_minor', l.amount_minor,
        'currency', l.currency,
        'available_after', l.available_after,
        'reserved_after', l.reserved_after,
        'topup_intent_id', l.topup_intent_id,
        'fee_reservation_id', l.fee_reservation_id,
        'occurred_at', l.occurred_at
      ) ORDER BY l.occurred_at DESC), '[]'::jsonb)
      FROM public.commerce_wallet_ledger l
      WHERE l.owner_user_id = v_actor
      LIMIT 200
    ),
    'receipts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'receipt_number', r.receipt_number,
        'receipt_kind', r.receipt_kind,
        'document_type', r.document_type,
        'status', r.status,
        'amount_minor', r.amount_minor,
        'currency', r.currency,
        'issued_at', r.issued_at,
        'voided_at', r.voided_at
      ) ORDER BY r.issued_at DESC), '[]'::jsonb)
      FROM public.commerce_wallet_receipts r
      WHERE r.owner_user_id = v_actor
      LIMIT 100
    ),
    'generatedAt', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_get_wallet_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commerce_create_wallet_topup_intent(text, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_attach_wallet_topup_payment(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_credit_wallet_topup(uuid, bigint, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_get_my_wallet_snapshot() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.commerce_get_wallet_catalog() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_create_wallet_topup_intent(text, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_attach_wallet_topup_payment(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_credit_wallet_topup(uuid, bigint, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_get_my_wallet_snapshot() TO authenticated;

NOTIFY pgrst, 'reload schema';
