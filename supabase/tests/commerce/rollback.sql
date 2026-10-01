\set ON_ERROR_STOP on

RESET ROLE;
INSERT INTO public.commerce_packages(id, code, name, is_active)
VALUES ('30000000-0000-4000-8000-000000000099', 'invalid_worker_fixture', 'Invalid Worker Fixture', true);
INSERT INTO public.commerce_package_versions(
  id, package_id, version, status, currency, billing_mode, unit_amount_minor,
  tax_rate_basis_points, terms_version, benefits, valid_from
) VALUES (
  '40000000-0000-4000-8000-000000000099',
  '30000000-0000-4000-8000-000000000099',
  1, 'active', 'VND', 'one_time', 120000, 0, 'invalid-v1',
  '[{"kind":"listing_quota","quantity":1}]'::jsonb,
  now() - interval '1 minute'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SELECT order_id AS rollback_order_id
FROM public.commerce_create_order(
  '40000000-0000-4000-8000-000000000099', 1, 'rollback-order-owner1-01'
) \gset

RESET ROLE;
ALTER TABLE public.commerce_order_items DISABLE TRIGGER trg_commerce_order_item_identity_immutable;
UPDATE public.commerce_order_items
SET benefit_snapshot = '[{"kind":"listing_quota","quantity":"bad"}]'::jsonb
WHERE order_id = :'rollback_order_id'::uuid;
ALTER TABLE public.commerce_order_items ENABLE TRIGGER trg_commerce_order_item_identity_immutable;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SELECT payment_attempt_id AS rollback_attempt_id, attempt_expires_at AS rollback_expires_at
FROM public.commerce_start_payment_attempt(
  :'rollback_order_id'::uuid, 'payos', 'rollback-payment-owner1-01'
) \gset

RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT public.commerce_claim_payment_checkout(:'rollback_attempt_id'::uuid, 'rollback-claim-token-01');
SELECT public.commerce_attach_payment_checkout(
  :'rollback_attempt_id'::uuid,
  'payos-link-rollback-01',
  'https://pay.payos.vn/web/rollback-test',
  :'rollback_expires_at'::timestamptz
);
SELECT webhook_inbox_id AS rollback_inbox_id
FROM public.commerce_enqueue_verified_payment_webhook(
  'payos', 'payos-event-rollback-01', 'payos-link-rollback-01',
  'payment.succeeded', 120000, 'VND', repeat('d',64), repeat('e',64),
  '{"code":"00","fixture":"rollback"}'::jsonb,
  clock_timestamp()
) \gset
SELECT webhook_inbox_id AS rollback_claimed_inbox_id, processing_token AS rollback_processing_token
FROM public.commerce_claim_payment_webhooks(10)
WHERE webhook_inbox_id = :'rollback_inbox_id'::uuid \gset

\set ON_ERROR_STOP off
SELECT * FROM public.commerce_process_payment_webhook(
  :'rollback_claimed_inbox_id'::uuid,
  :'rollback_processing_token'::uuid
);
\set rollback_sqlstate :SQLSTATE
\set ON_ERROR_STOP on

SELECT :'rollback_sqlstate' = '23514' AS rollback_expected \gset
\if :rollback_expected
\else
  \echo unexpected worker SQLSTATE :rollback_sqlstate
  \quit 3
\endif

RESET ROLE;
DO $$
DECLARE
  v_order_id uuid := (SELECT id FROM public.commerce_orders WHERE idempotency_key = 'rollback-order-owner1-01');
  v_attempt_id uuid := (SELECT id FROM public.commerce_payment_attempts WHERE idempotency_key = 'rollback-payment-owner1-01');
BEGIN
  IF (SELECT status FROM public.commerce_orders WHERE id = v_order_id) <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'order mutation was not rolled back';
  END IF;
  IF (SELECT status FROM public.commerce_payment_attempts WHERE id = v_attempt_id) <> 'pending' THEN
    RAISE EXCEPTION 'attempt mutation was not rolled back';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commerce_entitlements e
    JOIN public.commerce_order_items oi ON oi.id = e.order_item_id
    WHERE oi.order_id = v_order_id
  ) THEN
    RAISE EXCEPTION 'entitlement insert was not rolled back';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commerce_outbox
    WHERE aggregate_id = v_order_id AND topic = 'commerce.order.paid'
  ) THEN
    RAISE EXCEPTION 'paid outbox insert was not rolled back';
  END IF;
END
$$;

SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT public.commerce_fail_payment_webhook(
  :'rollback_claimed_inbox_id'::uuid,
  :'rollback_processing_token'::uuid,
  'benefit_snapshot_invalid',
  true
) AS rollback_failure_outcome \gset

RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.commerce_webhook_inbox WHERE provider_event_id = 'payos-event-rollback-01') <> 'retry' THEN
    RAISE EXCEPTION 'inbox retry status missing';
  END IF;
END
$$;

SELECT jsonb_build_object(
  'expected_sqlstate', :'rollback_sqlstate',
  'failure_outcome', :'rollback_failure_outcome',
  'rollback_pass', true
) AS commerce_rollback_result;
