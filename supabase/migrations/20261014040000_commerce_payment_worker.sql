-- =============================================================================
-- Commerce payment worker: leased inbox processing and atomic entitlement grant
-- Additive only. Production execution is user-run.
-- =============================================================================

ALTER TABLE public.commerce_webhook_inbox
  ADD COLUMN IF NOT EXISTS processing_token uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_outbox_topic_aggregate
  ON public.commerce_outbox(topic, aggregate_type, aggregate_id);

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
      i.status IN ('pending', 'retry')
      AND (i.next_attempt_at IS NULL OR i.next_attempt_at <= clock_timestamp())
    ) OR (
      i.status = 'processing'
      AND i.next_attempt_at IS NOT NULL
      AND i.next_attempt_at <= clock_timestamp()
    )
    ORDER BY i.received_at, i.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.commerce_webhook_inbox i
  SET status = 'processing',
      attempts = i.attempts + 1,
      processing_token = gen_random_uuid(),
      next_attempt_at = clock_timestamp() + interval '2 minutes',
      last_error_code = NULL
  FROM candidates c
  WHERE i.id = c.id
  RETURNING i.id, i.processing_token, i.provider, i.provider_event_id, i.attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_process_payment_webhook(
  p_webhook_inbox_id uuid,
  p_processing_token uuid
)
RETURNS TABLE(
  webhook_inbox_id uuid,
  payment_attempt_id uuid,
  order_id uuid,
  outcome text,
  duplicate_settlement boolean,
  entitlements_granted integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_provider text;
  v_provider_event_id text;
  v_inbox public.commerce_webhook_inbox%ROWTYPE;
  v_event public.commerce_payment_events%ROWTYPE;
  v_attempt_id uuid;
  v_order_id uuid;
  v_attempt public.commerce_payment_attempts%ROWTYPE;
  v_order public.commerce_orders%ROWTYPE;
  v_item public.commerce_order_items%ROWTYPE;
  v_version public.commerce_package_versions%ROWTYPE;
  v_subscription public.commerce_subscriptions%ROWTYPE;
  v_period public.commerce_subscription_periods%ROWTYPE;
  v_entitlement public.commerce_entitlements%ROWTYPE;
  v_benefit jsonb;
  v_kind text;
  v_seen_kinds text[] := ARRAY[]::text[];
  v_quantity_bigint bigint;
  v_quantity integer;
  v_duration_days integer;
  v_entitlement_status text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_paid_at timestamptz;
  v_duplicate boolean := false;
  v_attempt_settled boolean := false;
  v_failure_ignored boolean := false;
  v_granted integer := 0;
  v_item_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_webhook_inbox_id IS NULL OR p_processing_token IS NULL THEN
    RAISE EXCEPTION 'Webhook inbox id and processing token are required.' USING ERRCODE = '22023';
  END IF;

  SELECT i.provider, i.provider_event_id
  INTO v_provider, v_provider_event_id
  FROM public.commerce_webhook_inbox i
  WHERE i.id = p_webhook_inbox_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Webhook inbox not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_event
  FROM public.commerce_payment_events e
  WHERE e.provider = v_provider
    AND e.provider_event_id = v_provider_event_id
  FOR UPDATE;

  SELECT * INTO v_inbox
  FROM public.commerce_webhook_inbox i
  WHERE i.id = p_webhook_inbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Webhook inbox changed concurrently.' USING ERRCODE = '40001';
  END IF;
  IF v_inbox.status = 'processed' THEN
    RETURN QUERY SELECT v_inbox.id, v_event.payment_attempt_id, v_event.order_id, 'already_processed'::text, false, 0;
    RETURN;
  END IF;
  IF v_inbox.status <> 'processing' OR v_inbox.processing_token IS DISTINCT FROM p_processing_token THEN
    RAISE EXCEPTION 'Webhook claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;
  IF v_event.id IS NULL
     OR v_event.verification_method <> v_inbox.verification_method
     OR v_event.signed_data_hash IS DISTINCT FROM v_inbox.signed_data_hash
     OR v_event.provider_lookup_hash IS DISTINCT FROM v_inbox.provider_lookup_hash THEN
    RAISE EXCEPTION 'Webhook inbox and payment event are inconsistent.' USING ERRCODE = '23514';
  END IF;
  IF v_event.verification_method = 'webhook_signature' AND NOT v_event.signature_valid THEN
    RAISE EXCEPTION 'Unsigned webhook payment event cannot be processed.' USING ERRCODE = '22023';
  END IF;
  IF v_event.verification_method = 'provider_api_lookup' AND v_event.signature_valid THEN
    RAISE EXCEPTION 'Provider lookup event cannot claim webhook signature verification.' USING ERRCODE = '23514';
  END IF;
  IF v_event.event_type NOT IN ('payment.succeeded', 'payment.failed') THEN
    RAISE EXCEPTION 'Unsupported payment event type.' USING ERRCODE = '22023';
  END IF;
  IF v_event.amount_minor IS NULL OR v_event.currency IS NULL THEN
    RAISE EXCEPTION 'Payment event amount and currency are required.' USING ERRCODE = '22023';
  END IF;
  IF v_event.occurred_at IS NOT NULL AND NOT isfinite(v_event.occurred_at) THEN
    RAISE EXCEPTION 'Payment event timestamp must be finite.' USING ERRCODE = '22023';
  END IF;

  SELECT a.id, a.order_id
  INTO v_attempt_id, v_order_id
  FROM public.commerce_payment_attempts a
  WHERE a.provider = v_event.provider
    AND a.provider_payment_id = v_event.provider_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment event is not attached to a payment attempt.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order
  FROM public.commerce_orders o
  WHERE o.id = v_order_id
  FOR UPDATE;

  SELECT * INTO v_attempt
  FROM public.commerce_payment_attempts a
  WHERE a.id = v_attempt_id
    AND a.order_id = v_order.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment attempt changed concurrently.' USING ERRCODE = '40001';
  END IF;
  IF (v_event.payment_attempt_id IS NOT NULL AND v_event.payment_attempt_id <> v_attempt.id)
     OR (v_event.order_id IS NOT NULL AND v_event.order_id <> v_order.id) THEN
    RAISE EXCEPTION 'Payment event linkage conflicts with provider payment identity.' USING ERRCODE = '23514';
  END IF;
  IF v_event.amount_minor <> v_attempt.amount_minor
     OR v_event.amount_minor <> v_order.total_minor THEN
    RAISE EXCEPTION 'Payment amount does not match attempt and order.' USING ERRCODE = '22023';
  END IF;
  IF v_event.currency <> v_attempt.currency
     OR v_event.currency <> v_order.currency THEN
    RAISE EXCEPTION 'Payment currency does not match attempt and order.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.commerce_payment_events e
  SET payment_attempt_id = v_attempt.id,
      order_id = v_order.id
  WHERE e.id = v_event.id;

  IF v_event.event_type = 'payment.failed' THEN
    v_attempt_settled := v_attempt.status IN ('succeeded', 'partially_refunded', 'refunded', 'chargeback');
    SELECT
      v_attempt_settled
      OR EXISTS (
        SELECT 1
        FROM public.commerce_payment_attempts settled
        WHERE settled.order_id = v_order.id
          AND settled.id <> v_attempt.id
          AND settled.status IN ('succeeded', 'partially_refunded', 'refunded', 'chargeback')
      )
    INTO v_failure_ignored;

    IF NOT v_attempt_settled THEN
      UPDATE public.commerce_payment_attempts a
      SET status = 'failed',
          failed_at = COALESCE(a.failed_at, v_event.occurred_at, clock_timestamp()),
          provider_metadata = a.provider_metadata || jsonb_build_object('failure_provider_event_id', v_event.provider_event_id),
          updated_at = clock_timestamp()
      WHERE a.id = v_attempt.id;
    END IF;

    IF NOT v_failure_ignored THEN
      UPDATE public.commerce_orders o
      SET status = 'payment_failed', updated_at = clock_timestamp()
      WHERE o.id = v_order.id
        AND o.status IN ('draft', 'awaiting_payment', 'payment_failed')
        AND NOT EXISTS (
          SELECT 1 FROM public.commerce_payment_attempts settled
          WHERE settled.order_id = o.id
            AND settled.status IN ('succeeded', 'partially_refunded', 'refunded', 'chargeback')
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.commerce_payment_attempts active
          WHERE active.order_id = o.id
            AND active.id <> v_attempt.id
            AND active.status IN ('created', 'pending')
            AND (active.expires_at IS NULL OR active.expires_at > clock_timestamp())
        );
    END IF;

    INSERT INTO public.commerce_outbox(topic, aggregate_type, aggregate_id, payload, next_attempt_at)
    VALUES (
      CASE WHEN v_failure_ignored
        THEN 'commerce.payment.failure_ignored'
        ELSE 'commerce.payment.failed'
      END,
      'payment_attempt', v_attempt.id,
      jsonb_build_object('order_id', v_order.id, 'provider_event_id', v_event.provider_event_id),
      clock_timestamp()
    ) ON CONFLICT (topic, aggregate_type, aggregate_id) DO NOTHING;

    INSERT INTO public.commerce_audit_events(
      owner_user_id, actor_role, entity_type, entity_id, event_type, correlation_id, after_state
    ) VALUES (
      v_order.owner_user_id, 'provider', 'payment_attempt', v_attempt.id,
      CASE WHEN v_failure_ignored THEN 'payment_failure_ignored_after_settlement' ELSE 'payment_failed' END,
      v_event.provider_event_id,
      jsonb_build_object('order_id', v_order.id, 'provider', v_event.provider)
    );

    UPDATE public.commerce_webhook_inbox i
    SET status = 'processed', processed_at = clock_timestamp(), processing_token = NULL,
        next_attempt_at = NULL, last_error_code = NULL
    WHERE i.id = v_inbox.id;

    RETURN QUERY SELECT
      v_inbox.id, v_attempt.id, v_order.id,
      CASE WHEN v_failure_ignored THEN 'payment_failure_ignored' ELSE 'payment_failed' END,
      false, 0;
    RETURN;
  END IF;

  v_paid_at := COALESCE(v_event.occurred_at, clock_timestamp());
  SELECT EXISTS (
    SELECT 1 FROM public.commerce_payment_attempts settled
    WHERE settled.order_id = v_order.id
      AND settled.id <> v_attempt.id
      AND settled.status IN ('succeeded', 'partially_refunded', 'refunded', 'chargeback')
  ) INTO v_duplicate;

  IF v_attempt.status IN ('cancelled', 'partially_refunded', 'refunded', 'chargeback') THEN
    RAISE EXCEPTION 'Payment attempt cannot transition to succeeded.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.commerce_payment_attempts a
  SET status = 'succeeded',
      succeeded_at = COALESCE(a.succeeded_at, v_paid_at),
      failed_at = NULL,
      provider_metadata = a.provider_metadata || jsonb_build_object('success_provider_event_id', v_event.provider_event_id),
      updated_at = clock_timestamp()
  WHERE a.id = v_attempt.id;

  IF v_order.status NOT IN ('partially_refunded', 'refunded', 'chargeback') THEN
    UPDATE public.commerce_orders o
    SET status = 'paid', paid_at = COALESCE(o.paid_at, v_paid_at), updated_at = clock_timestamp()
    WHERE o.id = v_order.id;
  END IF;

  SELECT count(*) INTO v_item_count
  FROM public.commerce_order_items oi
  WHERE oi.order_id = v_order.id;

  IF v_item_count <> 1 THEN
    RAISE EXCEPTION 'Commerce payment worker requires exactly one snapshotted order item.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_item
  FROM public.commerce_order_items oi
  WHERE oi.order_id = v_order.id
  FOR UPDATE;

  SELECT * INTO v_version
  FROM public.commerce_package_versions pv
  WHERE pv.id = v_item.package_version_id
  FOR SHARE;

  IF NOT FOUND OR jsonb_typeof(v_item.benefit_snapshot) <> 'array' OR jsonb_array_length(v_item.benefit_snapshot) = 0 THEN
    RAISE EXCEPTION 'Order item benefit snapshot is invalid.' USING ERRCODE = '23514';
  END IF;

  IF v_version.billing_mode = 'subscription' THEN
    SELECT * INTO v_period
    FROM public.commerce_subscription_periods sp
    WHERE sp.order_id = v_order.id
    FOR UPDATE;

    IF FOUND THEN
      SELECT * INTO v_subscription
      FROM public.commerce_subscriptions s
      WHERE s.id = v_period.subscription_id
      FOR UPDATE;

      IF NOT FOUND
         OR v_subscription.owner_user_id <> v_order.owner_user_id
         OR v_subscription.package_version_id <> v_item.package_version_id
         OR v_period.status NOT IN ('pending', 'paid', 'active', 'failed') THEN
        RAISE EXCEPTION 'Subscription period does not match paid order.' USING ERRCODE = '23514';
      END IF;
    ELSE
      INSERT INTO public.commerce_subscriptions(
        owner_user_id, package_version_id, provider, status
      ) VALUES (
        v_order.owner_user_id, v_item.package_version_id, v_attempt.provider, 'active'
      ) RETURNING * INTO v_subscription;

      INSERT INTO public.commerce_subscription_periods(
        subscription_id, cycle_number, order_id, status
      ) VALUES (
        v_subscription.id, 1, v_order.id, 'pending'
      ) RETURNING * INTO v_period;
    END IF;

    v_period_start := COALESCE(v_period.period_start, v_paid_at);
    v_period_end := COALESCE(
      v_period.period_end,
      v_period_start + make_interval(days => v_version.billing_period_days)
    );

    UPDATE public.commerce_subscription_periods sp
    SET status = 'active', period_start = v_period_start, period_end = v_period_end,
        grace_until = v_period_end + interval '3 days', updated_at = clock_timestamp()
    WHERE sp.id = v_period.id
    RETURNING * INTO v_period;

    UPDATE public.commerce_subscriptions s
    SET status = 'active', current_period_start = v_period.period_start,
        current_period_end = v_period.period_end, updated_at = clock_timestamp()
    WHERE s.id = v_subscription.id
    RETURNING * INTO v_subscription;
  END IF;

  FOR v_benefit IN SELECT value FROM jsonb_array_elements(v_item.benefit_snapshot)
  LOOP
    IF jsonb_typeof(v_benefit) <> 'object' THEN
      RAISE EXCEPTION 'Order benefit must be an object.' USING ERRCODE = '23514';
    END IF;

    v_kind := v_benefit->>'kind';
    IF v_kind IS NULL
       OR v_kind NOT IN ('listing_quota', 'listing_duration', 'sponsored_placement', 'seller_analytics')
       OR v_kind = ANY(v_seen_kinds) THEN
      RAISE EXCEPTION 'Order benefit kind is invalid or duplicated.' USING ERRCODE = '23514';
    END IF;
    v_seen_kinds := array_append(v_seen_kinds, v_kind);

    IF COALESCE(v_benefit->>'quantity', '') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'Order benefit quantity is invalid.' USING ERRCODE = '23514';
    END IF;
    v_quantity_bigint := (v_benefit->>'quantity')::bigint * v_item.quantity::bigint;
    IF v_quantity_bigint > 2147483647 THEN
      RAISE EXCEPTION 'Order benefit quantity exceeds supported range.' USING ERRCODE = '22003';
    END IF;
    v_quantity := v_quantity_bigint::integer;

    v_duration_days := NULL;
    IF v_benefit ? 'durationDays' THEN
      IF COALESCE(v_benefit->>'durationDays', '') !~ '^[1-9][0-9]*$'
         OR (v_benefit->>'durationDays')::bigint > 2147483647 THEN
        RAISE EXCEPTION 'Order benefit duration is invalid.' USING ERRCODE = '23514';
      END IF;
      v_duration_days := (v_benefit->>'durationDays')::integer;
    END IF;

    IF v_kind = 'sponsored_placement' AND (
      NULLIF(btrim(v_benefit->>'placementCode'), '') IS NULL
      OR NULLIF(btrim(v_benefit->>'sponsoredLabel'), '') IS NULL
      OR v_duration_days IS NULL
    ) THEN
      RAISE EXCEPTION 'Sponsored placement benefit metadata is incomplete.' USING ERRCODE = '23514';
    END IF;

    v_entitlement_status := CASE
      WHEN v_kind IN ('listing_quota', 'seller_analytics') THEN 'active'
      ELSE 'awaiting_listing_approval'
    END;
    v_starts_at := CASE WHEN v_entitlement_status = 'active' THEN v_paid_at ELSE NULL END;
    v_ends_at := CASE
      WHEN v_version.billing_mode = 'subscription' THEN v_period.period_end
      WHEN v_entitlement_status <> 'active' THEN NULL
      WHEN v_duration_days IS NOT NULL THEN v_paid_at + make_interval(days => v_duration_days)
      ELSE NULL
    END;

    v_entitlement.id := NULL;
    INSERT INTO public.commerce_entitlements(
      owner_user_id, order_item_id, package_version_id, subscription_period_id,
      benefit_kind, status, quantity_total, quantity_remaining, duration_days,
      placement_code, sponsored_label, starts_at, ends_at, activated_at
    ) VALUES (
      v_order.owner_user_id, v_item.id, v_item.package_version_id,
      CASE WHEN v_version.billing_mode = 'subscription' THEN v_period.id ELSE NULL END,
      v_kind, v_entitlement_status, v_quantity, v_quantity, v_duration_days,
      NULLIF(btrim(v_benefit->>'placementCode'), ''),
      NULLIF(btrim(v_benefit->>'sponsoredLabel'), ''),
      v_starts_at, v_ends_at, v_starts_at
    )
    ON CONFLICT (order_item_id, benefit_kind) DO NOTHING
    RETURNING * INTO v_entitlement;

    IF v_entitlement.id IS NOT NULL THEN
      v_granted := v_granted + 1;
      IF v_kind = 'listing_quota' THEN
        INSERT INTO public.commerce_quota_ledger(
          entitlement_id, owner_user_id, order_id, operation, delta,
          balance_after, idempotency_key, metadata, occurred_at
        ) VALUES (
          v_entitlement.id, v_order.owner_user_id, v_order.id, 'grant', v_quantity,
          v_quantity, 'payment-event:' || v_event.id::text || ':grant',
          jsonb_build_object('payment_attempt_id', v_attempt.id, 'provider_event_id', v_event.provider_event_id),
          v_paid_at
        );
      END IF;
    ELSE
      SELECT * INTO v_entitlement
      FROM public.commerce_entitlements e
      WHERE e.order_item_id = v_item.id AND e.benefit_kind = v_kind
      FOR UPDATE;

      IF v_entitlement.owner_user_id <> v_order.owner_user_id
         OR v_entitlement.package_version_id <> v_item.package_version_id
         OR v_entitlement.quantity_total <> v_quantity
         OR v_entitlement.subscription_period_id IS DISTINCT FROM (
              CASE WHEN v_version.billing_mode = 'subscription' THEN v_period.id ELSE NULL END
            ) THEN
        RAISE EXCEPTION 'Existing entitlement conflicts with paid order snapshot.' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.commerce_outbox(topic, aggregate_type, aggregate_id, payload, next_attempt_at)
  VALUES (
    'commerce.order.paid', 'order', v_order.id,
    jsonb_build_object(
      'payment_attempt_id', v_attempt.id,
      'provider_event_id', v_event.provider_event_id,
      'duplicate_settlement', v_duplicate,
      'entitlements_granted', v_granted
    ),
    clock_timestamp()
  ) ON CONFLICT (topic, aggregate_type, aggregate_id) DO NOTHING;

  IF v_duplicate THEN
    INSERT INTO public.commerce_outbox(topic, aggregate_type, aggregate_id, payload, next_attempt_at)
    VALUES (
      'commerce.payment.duplicate_settlement', 'payment_attempt', v_attempt.id,
      jsonb_build_object('order_id', v_order.id, 'provider_event_id', v_event.provider_event_id),
      clock_timestamp()
    ) ON CONFLICT (topic, aggregate_type, aggregate_id) DO NOTHING;
  END IF;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state, metadata
  ) VALUES (
    v_order.owner_user_id, 'provider', 'order', v_order.id,
    'payment_succeeded', v_event.provider_event_id,
    jsonb_build_object(
      'status', 'paid', 'payment_attempt_id', v_attempt.id,
      'entitlements_granted', v_granted
    ),
    jsonb_build_object('duplicate_settlement', v_duplicate)
  );

  UPDATE public.commerce_webhook_inbox i
  SET status = 'processed', processed_at = clock_timestamp(), processing_token = NULL,
      next_attempt_at = NULL, last_error_code = NULL
  WHERE i.id = v_inbox.id;

  RETURN QUERY SELECT v_inbox.id, v_attempt.id, v_order.id, 'payment_succeeded'::text, v_duplicate, v_granted;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_fail_payment_webhook(
  p_webhook_inbox_id uuid,
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
  v_inbox public.commerce_webhook_inbox%ROWTYPE;
  v_next_status text;
  v_next_attempt_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_webhook_inbox_id IS NULL OR p_processing_token IS NULL THEN
    RAISE EXCEPTION 'Webhook inbox id and processing token are required.' USING ERRCODE = '22023';
  END IF;
  IF p_error_code IS NULL OR p_error_code !~ '^[A-Za-z0-9_:-]{2,80}$' THEN
    RAISE EXCEPTION 'Invalid webhook worker error code.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_inbox
  FROM public.commerce_webhook_inbox i
  WHERE i.id = p_webhook_inbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Webhook inbox not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_inbox.status = 'processed' THEN
    RETURN 'processed';
  END IF;
  IF v_inbox.status <> 'processing' OR v_inbox.processing_token IS DISTINCT FROM p_processing_token THEN
    RAISE EXCEPTION 'Webhook claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;

  IF p_retryable AND v_inbox.attempts < 8 THEN
    v_next_status := 'retry';
    v_next_attempt_at := clock_timestamp() + CASE v_inbox.attempts
      WHEN 1 THEN interval '15 seconds'
      WHEN 2 THEN interval '30 seconds'
      WHEN 3 THEN interval '1 minute'
      WHEN 4 THEN interval '2 minutes'
      WHEN 5 THEN interval '5 minutes'
      WHEN 6 THEN interval '15 minutes'
      ELSE interval '30 minutes'
    END;
  ELSE
    v_next_status := 'dead_letter';
    v_next_attempt_at := NULL;
  END IF;

  UPDATE public.commerce_webhook_inbox i
  SET status = v_next_status,
      processing_token = NULL,
      next_attempt_at = v_next_attempt_at,
      last_error_code = p_error_code
  WHERE i.id = v_inbox.id;

  INSERT INTO public.commerce_audit_events(
    actor_role, entity_type, entity_id, event_type, correlation_id, after_state
  ) VALUES (
    'system', 'webhook_inbox', v_inbox.id,
    CASE WHEN v_next_status = 'retry' THEN 'payment_webhook_retry_scheduled' ELSE 'payment_webhook_dead_lettered' END,
    v_inbox.provider_event_id,
    jsonb_build_object(
      'status', v_next_status,
      'attempts', v_inbox.attempts,
      'error_code', p_error_code,
      'next_attempt_at', v_next_attempt_at
    )
  );

  RETURN v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_claim_payment_webhooks(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_process_payment_webhook(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_fail_payment_webhook(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_claim_payment_webhooks(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_process_payment_webhook(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_fail_payment_webhook(uuid, uuid, text, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
