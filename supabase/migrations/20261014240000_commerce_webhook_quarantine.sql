-- Quarantine one verified orphan PayOS test webhook without treating it as settled.
-- Production migration is user-run only.

ALTER TABLE public.commerce_webhook_inbox
  DROP CONSTRAINT IF EXISTS commerce_webhook_inbox_status_check;

ALTER TABLE public.commerce_webhook_inbox
  ADD CONSTRAINT commerce_webhook_inbox_status_check
  CHECK (status IN ('pending','processing','processed','retry','dead_letter','quarantined'));

CREATE OR REPLACE FUNCTION public.commerce_quarantine_orphan_test_webhook(
  p_webhook_inbox_id uuid
)
RETURNS TABLE(
  webhook_inbox_id uuid,
  audit_event_id uuid,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inbox public.commerce_webhook_inbox%ROWTYPE;
  v_event public.commerce_payment_events%ROWTYPE;
  v_order_code text;
  v_before jsonb;
  v_after jsonb;
  v_audit_event_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_webhook_inbox_id IS NULL THEN
    RAISE EXCEPTION 'Webhook inbox id is required.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_inbox
  FROM public.commerce_webhook_inbox i
  WHERE i.id = p_webhook_inbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Webhook inbox not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_event
  FROM public.commerce_payment_events e
  WHERE e.provider = v_inbox.provider
    AND e.provider_event_id = v_inbox.provider_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment event not found.' USING ERRCODE = 'P0002';
  END IF;

  v_order_code := COALESCE(
    v_event.payload->>'orderCode',
    v_event.payload->'data'->>'orderCode'
  );

  IF v_inbox.provider <> 'payos'
     OR v_inbox.provider_event_id <> 'TF230204212323'
     OR v_inbox.status <> 'dead_letter'
     OR v_inbox.attempts <> 8
     OR v_inbox.last_error_code <> 'P0002'
     OR v_inbox.processing_token IS NOT NULL
     OR v_inbox.next_attempt_at IS NOT NULL
     OR v_inbox.processed_at IS NOT NULL
     OR v_inbox.verification_method <> 'webhook_signature'
     OR v_event.provider <> 'payos'
     OR v_event.provider_event_id <> 'TF230204212323'
     OR v_event.event_type <> 'payment.succeeded'
     OR NOT v_event.signature_valid
     OR v_event.verification_method <> 'webhook_signature'
     OR v_event.amount_minor <> 3000
     OR v_event.currency <> 'VND'
     OR v_event.occurred_at < TIMESTAMPTZ '2023-02-04 00:00:00+00'
     OR v_event.occurred_at >= TIMESTAMPTZ '2023-02-05 00:00:00+00'
     OR v_order_code <> '123'
     OR v_event.payment_attempt_id IS NOT NULL
     OR v_event.order_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'Webhook is not the approved orphan PayOS test event.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.commerce_payment_attempts a
    WHERE a.provider = v_event.provider
      AND a.provider_payment_id = v_event.provider_payment_id
  ) THEN
    RAISE EXCEPTION 'Webhook provider payment already has an internal payment attempt.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.commerce_wallet_topup_checkouts c
    WHERE c.provider = v_event.provider
      AND (
        c.provider_payment_id = v_event.provider_payment_id
        OR c.provider_order_code = 123
      )
  ) THEN
    RAISE EXCEPTION 'Webhook provider identity already has a Wallet checkout.' USING ERRCODE = '23514';
  END IF;

  v_before := jsonb_build_object(
    'status', v_inbox.status,
    'attempts', v_inbox.attempts,
    'last_error_code', v_inbox.last_error_code,
    'processed_at', v_inbox.processed_at,
    'next_attempt_at', v_inbox.next_attempt_at,
    'provider', v_inbox.provider,
    'provider_event_id', v_inbox.provider_event_id
  );

  UPDATE public.commerce_webhook_inbox i
  SET status = 'quarantined',
      processing_token = NULL,
      next_attempt_at = NULL
  WHERE i.id = v_inbox.id
    AND i.status = 'dead_letter';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Webhook status changed before quarantine.' USING ERRCODE = '40001';
  END IF;

  v_after := jsonb_build_object(
    'status', 'quarantined',
    'attempts', v_inbox.attempts,
    'last_error_code', v_inbox.last_error_code,
    'processed_at', NULL,
    'next_attempt_at', NULL,
    'provider', v_inbox.provider,
    'provider_event_id', v_inbox.provider_event_id
  );

  INSERT INTO public.commerce_audit_events(
    actor_role,
    entity_type,
    entity_id,
    event_type,
    correlation_id,
    before_state,
    after_state,
    metadata
  ) VALUES (
    'system',
    'webhook_inbox',
    v_inbox.id,
    'payment_webhook_quarantined',
    v_inbox.provider_event_id,
    v_before,
    v_after,
    jsonb_build_object(
      'reason', 'orphan_test_webhook',
      'provider', v_event.provider,
      'provider_event_id', v_event.provider_event_id,
      'provider_order_code', v_order_code,
      'provider_amount_minor', v_event.amount_minor,
      'provider_occurred_at', v_event.occurred_at,
      'last_error_code', v_inbox.last_error_code,
      'no_financial_mutation', true
    )
  )
  RETURNING id INTO v_audit_event_id;

  RETURN QUERY SELECT v_inbox.id, v_audit_event_id, 'quarantined'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_quarantine_orphan_test_webhook(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_quarantine_orphan_test_webhook(uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
