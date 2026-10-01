\set ON_ERROR_STOP on

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

SELECT order_id AS e2e_order_id
FROM public.commerce_create_order(
  'e2e00000-0000-4000-8000-000000000002',
  1,
  'order:e2e_staging_harness_001'
) \gset

SELECT payment_attempt_id AS e2e_attempt_id
FROM public.commerce_start_payment_attempt(
  :'e2e_order_id'::uuid,
  'payos',
  'payment:e2e_staging_harness_001'
) \gset

SELECT public.commerce_e2e_close_test_checkout(
  :'e2e_order_id'::uuid,
  'e2e_staging_harness_001'
);

RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_orders
    WHERE idempotency_key = 'order:e2e_staging_harness_001'
      AND status = 'cancelled'
      AND paid_at IS NULL
  ) THEN
    RAISE EXCEPTION 'staging E2E order was not safely closed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_payment_attempts a
    JOIN public.commerce_orders o ON o.id = a.order_id
    WHERE o.idempotency_key = 'order:e2e_staging_harness_001'
      AND a.status = 'cancelled'
      AND a.provider_payment_id IS NULL
  ) THEN
    RAISE EXCEPTION 'staging E2E attempt was not safely closed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_audit_events
    WHERE correlation_id = 'e2e_staging_harness_001'
      AND event_type = 'staging_e2e_checkout_closed'
  ) THEN
    RAISE EXCEPTION 'staging E2E cleanup audit missing';
  END IF;
END
$$;

SELECT jsonb_build_object(
  'order_cancelled', true,
  'attempt_cancelled', true,
  'provider_called', false,
  'audit_present', true,
  'staging_e2e_seed_pass', true
) AS commerce_staging_e2e_result;
