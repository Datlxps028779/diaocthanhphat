-- =============================================================================
-- Commerce webhook ingress: durable verified event + inbox before HTTP ACK
-- Additive only. Production execution is user-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.commerce_enqueue_verified_payment_webhook(
  p_provider text,
  p_provider_event_id text,
  p_provider_payment_id text,
  p_event_type text,
  p_amount_minor bigint,
  p_currency text,
  p_payload_hash text,
  p_signed_data_hash text,
  p_payload jsonb,
  p_occurred_at timestamptz
)
RETURNS TABLE(
  webhook_inbox_id uuid,
  payment_event_id uuid,
  duplicate boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt_id uuid;
  v_order_id uuid;
  v_owner_id uuid;
  v_inbox public.commerce_webhook_inbox%ROWTYPE;
  v_event public.commerce_payment_events%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_provider IS NULL OR p_provider !~ '^[a-z0-9_-]{2,40}$' THEN
    RAISE EXCEPTION 'Invalid webhook provider.' USING ERRCODE = '22023';
  END IF;
  IF p_provider_event_id IS NULL OR char_length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid provider event id.' USING ERRCODE = '22023';
  END IF;
  IF p_provider_payment_id IS NULL OR char_length(btrim(p_provider_payment_id)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid provider payment id.' USING ERRCODE = '22023';
  END IF;
  IF p_event_type IS NULL OR p_event_type !~ '^[a-z0-9_.:-]{2,80}$' THEN
    RAISE EXCEPTION 'Invalid payment event type.' USING ERRCODE = '22023';
  END IF;
  IF p_amount_minor IS NOT NULL AND p_amount_minor < 0 THEN
    RAISE EXCEPTION 'Invalid payment event amount.' USING ERRCODE = '22023';
  END IF;
  IF p_currency IS NOT NULL AND p_currency <> 'VND' THEN
    RAISE EXCEPTION 'Unsupported payment event currency.' USING ERRCODE = '22023';
  END IF;
  IF p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid webhook payload hash.' USING ERRCODE = '22023';
  END IF;
  IF p_signed_data_hash IS NULL OR p_signed_data_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid signed webhook data hash.' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid webhook payload.' USING ERRCODE = '22023';
  END IF;
  IF p_occurred_at IS NOT NULL AND NOT isfinite(p_occurred_at) THEN
    RAISE EXCEPTION 'Webhook occurrence timestamp must be finite.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_provider || ':' || btrim(p_provider_event_id), 140300));

  SELECT a.id, a.order_id, o.owner_user_id
  INTO v_attempt_id, v_order_id, v_owner_id
  FROM public.commerce_payment_attempts a
  JOIN public.commerce_orders o ON o.id = a.order_id
  WHERE a.provider = p_provider
    AND a.provider_payment_id = btrim(p_provider_payment_id);

  SELECT * INTO v_event
  FROM public.commerce_payment_events
  WHERE provider = p_provider
    AND provider_event_id = btrim(p_provider_event_id)
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.verification_method <> 'webhook_signature'
       OR NOT v_event.signature_valid
       OR v_event.signed_data_hash <> p_signed_data_hash
       OR v_event.provider_lookup_hash IS NOT NULL
       OR v_event.provider_payment_id <> btrim(p_provider_payment_id)
       OR v_event.event_type <> p_event_type
       OR v_event.amount_minor IS DISTINCT FROM p_amount_minor
       OR v_event.currency IS DISTINCT FROM p_currency
       OR (v_event.payment_attempt_id IS NOT NULL AND v_event.payment_attempt_id IS DISTINCT FROM v_attempt_id)
       OR (v_event.order_id IS NOT NULL AND v_event.order_id IS DISTINCT FROM v_order_id) THEN
      RAISE EXCEPTION 'Provider event id was replayed with different signed data.' USING ERRCODE = '22023';
    END IF;

    IF v_event.payment_attempt_id IS NULL AND v_attempt_id IS NOT NULL THEN
      UPDATE public.commerce_payment_events
      SET payment_attempt_id = v_attempt_id,
          order_id = v_order_id
      WHERE id = v_event.id
      RETURNING * INTO v_event;
    END IF;

    SELECT * INTO v_inbox
    FROM public.commerce_webhook_inbox
    WHERE provider = p_provider
      AND provider_event_id = btrim(p_provider_event_id)
    FOR UPDATE;

    IF NOT FOUND
       OR v_inbox.verification_method <> 'webhook_signature'
       OR v_inbox.signed_data_hash <> p_signed_data_hash
       OR v_inbox.provider_lookup_hash IS NOT NULL THEN
      RAISE EXCEPTION 'Webhook inbox and payment event are inconsistent.' USING ERRCODE = '23514';
    END IF;

    RETURN QUERY SELECT v_inbox.id, v_event.id, true;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.commerce_webhook_inbox
    WHERE provider = p_provider
      AND provider_event_id = btrim(p_provider_event_id)
  ) THEN
    RAISE EXCEPTION 'Webhook inbox exists without its payment event.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.commerce_webhook_inbox (
    provider, provider_event_id, status, headers, payload,
    payload_hash, verification_method, signed_data_hash, provider_lookup_hash,
    attempts, next_attempt_at
  ) VALUES (
    p_provider, btrim(p_provider_event_id), 'pending', '{}'::jsonb, p_payload,
    p_payload_hash, 'webhook_signature', p_signed_data_hash, NULL,
    0, now()
  ) RETURNING * INTO v_inbox;

  INSERT INTO public.commerce_payment_events (
    provider, provider_event_id, provider_payment_id, payment_attempt_id, order_id,
    event_type, signature_valid, verification_method, amount_minor, currency,
    payload_hash, signed_data_hash, provider_lookup_hash, payload, occurred_at
  ) VALUES (
    p_provider, btrim(p_provider_event_id), btrim(p_provider_payment_id), v_attempt_id, v_order_id,
    p_event_type, true, 'webhook_signature', p_amount_minor, p_currency,
    p_payload_hash, p_signed_data_hash, NULL, p_payload, p_occurred_at
  ) RETURNING * INTO v_event;

  INSERT INTO public.commerce_audit_events (
    owner_user_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state, metadata
  ) VALUES (
    v_owner_id, 'provider', 'payment_event', v_event.id,
    'payment_webhook_enqueued', btrim(p_provider_event_id),
    jsonb_build_object(
      'provider', p_provider,
      'event_type', p_event_type,
      'payment_attempt_id', v_attempt_id,
      'order_id', v_order_id
    ),
    jsonb_build_object('webhook_inbox_id', v_inbox.id)
  );

  RETURN QUERY SELECT v_inbox.id, v_event.id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_enqueue_verified_payment_webhook(
  text, text, text, text, bigint, text, text, text, jsonb, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_enqueue_verified_payment_webhook(
  text, text, text, text, bigint, text, text, text, jsonb, timestamptz
) TO service_role;

NOTIFY pgrst, 'reload schema';
