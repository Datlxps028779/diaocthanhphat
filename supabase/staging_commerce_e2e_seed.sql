-- STAGING ONLY. NEVER RUN ON PRODUCTION.
-- Creates one purchasable E2E package and a cleanup RPC for unpaid test orders.

INSERT INTO public.commerce_packages(id, code, name, description, is_active)
VALUES (
  'e2e00000-0000-4000-8000-000000000001',
  'e2e_checkout_test',
  'Gói E2E Staging',
  'Chỉ dùng cho checkout order/payment-attempt E2E trên staging; không gọi PayOS.',
  true
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = now();

INSERT INTO public.commerce_package_versions(
  id, package_id, version, status, currency, billing_mode, billing_period_days,
  unit_amount_minor, tax_rate_basis_points, terms_version, benefits,
  valid_from, valid_until, is_purchasable
)
VALUES (
  'e2e00000-0000-4000-8000-000000000002',
  'e2e00000-0000-4000-8000-000000000001',
  1,
  'active',
  'VND',
  'one_time',
  NULL,
  1000,
  0,
  'staging-e2e-v1',
  '[{"kind":"listing_quota","quantity":1},{"kind":"listing_duration","quantity":1,"durationDays":30}]'::jsonb,
  now(),
  NULL,
  true
)
ON CONFLICT (id) DO UPDATE
SET status = 'active',
    unit_amount_minor = EXCLUDED.unit_amount_minor,
    tax_rate_basis_points = 0,
    terms_version = EXCLUDED.terms_version,
    benefits = EXCLUDED.benefits,
    valid_from = EXCLUDED.valid_from,
    valid_until = NULL,
    is_purchasable = true,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.commerce_e2e_close_test_checkout(
  p_order_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_order public.commerce_orders%ROWTYPE;
  v_attempt_count integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^e2e_staging_[A-Za-z0-9_-]{8,120}$' THEN
    RAISE EXCEPTION 'Invalid staging E2E key.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order
  FROM public.commerce_orders o
  WHERE o.id = p_order_id
    AND o.owner_user_id = v_actor
    AND o.idempotency_key = 'order:' || p_idempotency_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owned staging E2E order not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status IN ('paid','partially_refunded','refunded','chargeback') OR v_order.paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'Settled order cannot be closed by E2E cleanup.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commerce_payment_attempts a
    WHERE a.order_id = v_order.id
      AND (a.provider_payment_id IS NOT NULL OR a.status IN ('succeeded','partially_refunded','refunded','chargeback'))
  ) THEN
    RAISE EXCEPTION 'Provider-linked or settled attempt cannot be closed by E2E cleanup.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.commerce_payment_attempts a
  SET status = 'cancelled',
      provider_metadata = a.provider_metadata - 'checkout_claim_token' - 'checkout_claimed_at',
      updated_at = clock_timestamp()
  WHERE a.order_id = v_order.id
    AND a.status IN ('created','pending','failed','cancelled');
  GET DIAGNOSTICS v_attempt_count = ROW_COUNT;

  UPDATE public.commerce_orders o
  SET status = 'cancelled',
      cancelled_at = COALESCE(o.cancelled_at, clock_timestamp()),
      updated_at = clock_timestamp()
  WHERE o.id = v_order.id;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    v_actor, v_actor, 'owner', 'order', v_order.id,
    'staging_e2e_checkout_closed', p_idempotency_key,
    jsonb_build_object('status', 'cancelled', 'attempts_closed', v_attempt_count)
  );

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'status', 'cancelled',
    'attempts_closed', v_attempt_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_e2e_close_test_checkout(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commerce_e2e_close_test_checkout(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
