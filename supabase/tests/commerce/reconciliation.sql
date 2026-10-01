\set ON_ERROR_STOP on

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SELECT order_id AS reconciliation_order_id
FROM public.commerce_create_order(
  '40000000-0000-4000-8000-000000000001', 1, 'reconciliation-order-001'
) \gset
SELECT payment_attempt_id AS reconciliation_attempt_id, attempt_expires_at AS reconciliation_expires_at
FROM public.commerce_start_payment_attempt(
  :'reconciliation_order_id'::uuid, 'payos', 'reconciliation-payment-001'
) \gset

RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT public.commerce_claim_payment_checkout(:'reconciliation_attempt_id'::uuid, 'reconciliation-claim-001');
SELECT public.commerce_attach_payment_checkout(
  :'reconciliation_attempt_id'::uuid,
  'payos-link-reconciliation-001',
  'https://pay.payos.vn/web/reconciliation-test',
  :'reconciliation_expires_at'::timestamptz
);

RESET ROLE;
UPDATE public.commerce_payment_reconciliation_jobs
SET next_attempt_at = clock_timestamp()
WHERE payment_attempt_id = :'reconciliation_attempt_id'::uuid;

SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT reconciliation_job_id AS reconciliation_job_id, processing_token AS reconciliation_token
FROM public.commerce_claim_payment_reconciliations(10)
WHERE payment_attempt_id = :'reconciliation_attempt_id'::uuid \gset

SELECT webhook_inbox_id AS reconciliation_inbox_id, outcome AS reconciliation_outcome
FROM public.commerce_complete_payment_reconciliation(
  :'reconciliation_job_id'::uuid,
  :'reconciliation_token'::uuid,
  'payos-link-reconciliation-001',
  'succeeded',
  100000,
  'VND',
  repeat('f', 64),
  clock_timestamp(),
  clock_timestamp()
) \gset

SELECT outcome AS reconciliation_replay_outcome
FROM public.commerce_complete_payment_reconciliation(
  :'reconciliation_job_id'::uuid,
  :'reconciliation_token'::uuid,
  'payos-link-reconciliation-001',
  'succeeded',
  100000,
  'VND',
  repeat('f', 64),
  clock_timestamp(),
  clock_timestamp()
) \gset

SELECT webhook_inbox_id AS claimed_reconciliation_inbox_id, processing_token AS reconciliation_webhook_token
FROM public.commerce_claim_payment_webhooks(10)
WHERE webhook_inbox_id = :'reconciliation_inbox_id'::uuid \gset
SELECT * FROM public.commerce_process_payment_webhook(
  :'claimed_reconciliation_inbox_id'::uuid,
  :'reconciliation_webhook_token'::uuid
);

RESET ROLE;
DO $$
DECLARE
  v_order_id uuid := (SELECT id FROM public.commerce_orders WHERE idempotency_key = 'reconciliation-order-001');
  v_attempt_id uuid := (SELECT id FROM public.commerce_payment_attempts WHERE idempotency_key = 'reconciliation-payment-001');
BEGIN
  IF (SELECT status FROM public.commerce_orders WHERE id = v_order_id) <> 'paid' THEN
    RAISE EXCEPTION 'reconciled order was not paid';
  END IF;
  IF (SELECT status FROM public.commerce_payment_attempts WHERE id = v_attempt_id) <> 'succeeded' THEN
    RAISE EXCEPTION 'reconciled payment attempt was not settled';
  END IF;
  IF (SELECT verification_method FROM public.commerce_payment_events WHERE order_id = v_order_id) <> 'provider_api_lookup' THEN
    RAISE EXCEPTION 'reconciliation event verification source is wrong';
  END IF;
  IF (SELECT count(*) FROM public.commerce_entitlements e JOIN public.commerce_order_items oi ON oi.id = e.order_item_id WHERE oi.order_id = v_order_id) <> 2 THEN
    RAISE EXCEPTION 'reconciled entitlements were not granted';
  END IF;
END
$$;

SELECT jsonb_build_object(
  'completion', :'reconciliation_outcome',
  'replay', :'reconciliation_replay_outcome',
  'reconciliation_pass',
    :'reconciliation_outcome' = 'event_enqueued'
    AND :'reconciliation_replay_outcome' = 'already_processed'
) AS commerce_reconciliation_result;
