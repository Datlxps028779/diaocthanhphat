-- Commerce staging write E2E post-verification. READ ONLY.

WITH test_orders AS (
  SELECT id, status, paid_at, idempotency_key
  FROM public.commerce_orders
  WHERE idempotency_key LIKE 'order:e2e_staging_%'
), test_attempts AS (
  SELECT a.id, a.order_id, a.status, a.provider_payment_id, a.checkout_url
  FROM public.commerce_payment_attempts a
  JOIN test_orders o ON o.id = a.order_id
), cleanup_audit AS (
  SELECT a.entity_id, a.correlation_id
  FROM public.commerce_audit_events a
  JOIN test_orders o ON o.id = a.entity_id
  WHERE a.event_type = 'staging_e2e_checkout_closed'
)
SELECT jsonb_build_object(
  'test_orders', (SELECT count(*) FROM test_orders),
  'test_attempts', (SELECT count(*) FROM test_attempts),
  'unclosed_orders', (
    SELECT count(*) FROM test_orders
    WHERE status <> 'cancelled' OR paid_at IS NOT NULL
  ),
  'unclosed_attempts', (
    SELECT count(*) FROM test_attempts
    WHERE status <> 'cancelled'
  ),
  'provider_linked_attempts', (
    SELECT count(*) FROM test_attempts
    WHERE provider_payment_id IS NOT NULL OR checkout_url IS NOT NULL
  ),
  'settled_attempts', (
    SELECT count(*) FROM test_attempts
    WHERE status IN ('succeeded','partially_refunded','refunded','chargeback')
  ),
  'cleanup_audit_events', (SELECT count(*) FROM cleanup_audit),
  'post_verify_pass', (
    (SELECT count(*) FROM test_orders) >= 1
    AND (SELECT count(*) FROM test_attempts) >= 1
    AND NOT EXISTS (SELECT 1 FROM test_orders WHERE status <> 'cancelled' OR paid_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM test_attempts WHERE status <> 'cancelled')
    AND NOT EXISTS (SELECT 1 FROM test_attempts WHERE provider_payment_id IS NOT NULL OR checkout_url IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM test_attempts WHERE status IN ('succeeded','partially_refunded','refunded','chargeback'))
    AND (SELECT count(*) FROM cleanup_audit) = (SELECT count(*) FROM test_orders)
  ),
  'verified_at', now()
) AS commerce_staging_e2e_post_verify;
