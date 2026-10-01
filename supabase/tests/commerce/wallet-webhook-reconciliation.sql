\set ON_ERROR_STOP on

RESET ROLE;

SELECT
  id AS attach_checkout_id,
  provider_order_code AS attach_provider_order_code,
  provider_payment_id AS attach_provider_payment_id,
  amount_minor AS attach_amount_minor,
  expires_at AS attach_checkout_expires_at
FROM public.commerce_wallet_topup_checkouts
WHERE idempotency_key = 'wallet-checkout-attach-001'
\gset

SELECT
  id AS recovery_checkout_id,
  provider_order_code AS recovery_provider_order_code,
  provider_payment_id AS recovery_provider_payment_id,
  amount_minor AS recovery_amount_minor,
  expires_at AS recovery_checkout_expires_at
FROM public.commerce_wallet_topup_checkouts
WHERE idempotency_key = 'wallet-checkout-recovery-001'
\gset

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', false);

INSERT INTO public.commerce_webhook_inbox(
  id, provider, provider_event_id, status, headers, payload, payload_hash,
  verification_method, signed_data_hash, attempts, next_attempt_at
) VALUES (
  '79000000-0000-4000-8000-000000000003', 'payos', 'non-wallet-webhook-001', 'pending', '{}',
  jsonb_build_object(
    'orderCode', 999999999,
    'paymentLinkId', 'non-wallet-payment-001',
    'code', '00', 'amount', 100000, 'currency', 'VND'
  ),
  repeat('4',64), 'webhook_signature', repeat('5',64), 0, clock_timestamp()
);
INSERT INTO public.commerce_payment_events(
  id, provider, provider_event_id, provider_payment_id, payment_attempt_id, order_id,
  event_type, signature_valid, verification_method, amount_minor, currency,
  payload_hash, signed_data_hash, payload, occurred_at
) VALUES (
  '79000000-0000-4000-8000-000000000004', 'payos', 'non-wallet-webhook-001',
  'non-wallet-payment-001', NULL, NULL, 'payment.succeeded', true, 'webhook_signature',
  100000, 'VND', repeat('4',64), repeat('5',64),
  jsonb_build_object(
    'orderCode', 999999999,
    'paymentLinkId', 'non-wallet-payment-001',
    'code', '00', 'amount', 100000, 'currency', 'VND'
  ), clock_timestamp()
);

SELECT count(*) AS non_wallet_claimed
FROM public.commerce_claim_wallet_payment_webhooks(10)
WHERE webhook_inbox_id = '79000000-0000-4000-8000-000000000003'::uuid
\gset non_wallet_

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.commerce_webhook_inbox
    WHERE id = '79000000-0000-4000-8000-000000000003'::uuid
      AND status = 'processing'
  ) <> 0 THEN
    RAISE EXCEPTION 'Wallet webhook worker claimed a non-Wallet payment inbox row';
  END IF;
END
$$;

SELECT
  id AS attach_checkout_id,
  provider_order_code AS attach_provider_order_code,
  provider_payment_id AS attach_provider_payment_id,
  amount_minor AS attach_amount_minor,
  expires_at AS attach_checkout_expires_at
FROM public.commerce_wallet_topup_checkouts
WHERE idempotency_key = 'wallet-checkout-attach-001'
\gset

INSERT INTO public.commerce_webhook_inbox(
  id, provider, provider_event_id, status, headers, payload, payload_hash,
  verification_method, signed_data_hash, attempts, next_attempt_at
) VALUES (
  '79000000-0000-4000-8000-000000000001', 'payos', 'wallet-webhook-success-001', 'pending', '{}',
  jsonb_build_object(
    'orderCode', :'attach_provider_order_code'::bigint,
    'paymentLinkId', :'attach_provider_payment_id',
    'code', '00', 'amount', :'attach_amount_minor'::bigint, 'currency', 'VND'
  ),
  repeat('1',64), 'webhook_signature', repeat('2',64), 0, clock_timestamp()
);

INSERT INTO public.commerce_payment_events(
  id, provider, provider_event_id, provider_payment_id, payment_attempt_id, order_id,
  event_type, signature_valid, verification_method, amount_minor, currency,
  payload_hash, signed_data_hash, payload, occurred_at
) VALUES (
  '79000000-0000-4000-8000-000000000002', 'payos', 'wallet-webhook-success-001',
  :'attach_provider_payment_id', NULL, NULL, 'payment.succeeded', true, 'webhook_signature',
  :'attach_amount_minor'::bigint, 'VND', repeat('1',64), repeat('2',64),
  jsonb_build_object(
    'orderCode', :'attach_provider_order_code'::bigint,
    'paymentLinkId', :'attach_provider_payment_id',
    'code', '00', 'amount', :'attach_amount_minor'::bigint, 'currency', 'VND'
  ), clock_timestamp()
);

SELECT *
FROM public.commerce_claim_wallet_payment_webhooks(10)
WHERE webhook_inbox_id = '79000000-0000-4000-8000-000000000001'::uuid
\gset webhook_

SELECT *
FROM public.commerce_process_wallet_payment_webhook(
  :'webhook_webhook_inbox_id'::uuid,
  :'webhook_processing_token'::uuid
);

SELECT *
FROM public.commerce_process_wallet_payment_webhook(
  :'webhook_webhook_inbox_id'::uuid,
  :'webhook_processing_token'::uuid
) AS replay_result;

SELECT *
FROM public.commerce_claim_wallet_topup_reconciliations(10)
WHERE topup_checkout_id = :'recovery_checkout_id'::uuid
\gset reconciliation_

SELECT *
FROM public.commerce_complete_wallet_topup_reconciliation(
  :'reconciliation_reconciliation_job_id'::uuid,
  :'reconciliation_processing_token'::uuid,
  :'recovery_provider_payment_id',
  'succeeded',
  :'recovery_amount_minor'::bigint,
  'VND',
  repeat('3',64),
  clock_timestamp(),
  clock_timestamp()
);

SELECT *
FROM public.commerce_claim_wallet_payment_webhooks(10)
WHERE provider_event_id = 'lookup:wallet:' || :'recovery_checkout_id'::uuid::text || ':succeeded'
\gset lookup_webhook_

SELECT *
FROM public.commerce_process_wallet_payment_webhook(
  :'lookup_webhook_webhook_inbox_id'::uuid,
  :'lookup_webhook_processing_token'::uuid
);

DO $$
DECLARE
  v_attach_intent uuid;
  v_recovery_intent uuid;
BEGIN
  SELECT topup_intent_id INTO v_attach_intent
  FROM public.commerce_wallet_topup_checkouts
  WHERE idempotency_key = 'wallet-checkout-attach-001';
  SELECT topup_intent_id INTO v_recovery_intent
  FROM public.commerce_wallet_topup_checkouts
  WHERE idempotency_key = 'wallet-checkout-recovery-001';

  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_topup_intents
    WHERE id = v_attach_intent AND status = 'credited'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_topup_intents
    WHERE id = v_recovery_intent AND status = 'credited'
  ) THEN
    RAISE EXCEPTION 'Wallet webhook or reconciliation did not credit top-up';
  END IF;
  IF (SELECT count(*) FROM public.commerce_wallet_ledger WHERE operation = 'topup_credit' AND topup_intent_id IN (v_attach_intent, v_recovery_intent)) <> 2 THEN
    RAISE EXCEPTION 'Wallet webhook/reconciliation credit ledger count is wrong';
  END IF;
  IF (SELECT count(*) FROM public.commerce_wallet_receipts WHERE receipt_kind = 'wallet_topup' AND topup_intent_id IN (v_attach_intent, v_recovery_intent)) <> 2 THEN
    RAISE EXCEPTION 'Wallet webhook/reconciliation receipt count is wrong';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commerce_webhook_inbox
    WHERE id IN ('79000000-0000-4000-8000-000000000001'::uuid)
      AND status <> 'processed'
  ) THEN
    RAISE EXCEPTION 'Wallet webhook inbox was not processed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commerce_wallet_topup_reconciliation_jobs
    WHERE topup_checkout_id IN (
      SELECT id FROM public.commerce_wallet_topup_checkouts
      WHERE idempotency_key IN ('wallet-checkout-attach-001', 'wallet-checkout-recovery-001')
    )
      AND status <> 'processed'
  ) THEN
    RAISE EXCEPTION 'Wallet reconciliation jobs were not processed';
  END IF;
END
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

SELECT topup_intent_id AS late_intent_id
FROM public.commerce_create_wallet_topup_intent(
  NULL, 150000, 'wallet-topup-late-success-001'
) \gset

SELECT *
FROM public.commerce_start_wallet_topup_checkout(
  :'late_intent_id'::uuid,
  'payos',
  'wallet-checkout-late-success-001'
) \gset late_

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT public.commerce_attach_wallet_topup_payment(
  :'late_topup_intent_id'::uuid,
  'payos',
  'wallet-provider-late-001'
);

INSERT INTO public.commerce_webhook_inbox(
  id, provider, provider_event_id, status, headers, payload, payload_hash,
  verification_method, signed_data_hash, attempts, next_attempt_at
) VALUES (
  '79000000-0000-4000-8000-000000000005', 'payos', 'wallet-late-failed-001', 'pending', '{}',
  jsonb_build_object(
    'orderCode', :'late_provider_order_code'::bigint,
    'paymentLinkId', 'wallet-provider-late-001',
    'code', '01', 'amount', 150000, 'currency', 'VND'
  ),
  repeat('6',64), 'webhook_signature', repeat('7',64), 0, clock_timestamp()
);
INSERT INTO public.commerce_payment_events(
  id, provider, provider_event_id, provider_payment_id, payment_attempt_id, order_id,
  event_type, signature_valid, verification_method, amount_minor, currency,
  payload_hash, signed_data_hash, payload, occurred_at
) VALUES (
  '79000000-0000-4000-8000-000000000006', 'payos', 'wallet-late-failed-001',
  'wallet-provider-late-001', NULL, NULL, 'payment.failed', true, 'webhook_signature',
  150000, 'VND', repeat('6',64), repeat('7',64),
  jsonb_build_object(
    'orderCode', :'late_provider_order_code'::bigint,
    'paymentLinkId', 'wallet-provider-late-001',
    'code', '01', 'amount', 150000, 'currency', 'VND'
  ), clock_timestamp()
);

SELECT *
FROM public.commerce_claim_wallet_payment_webhooks(10)
WHERE webhook_inbox_id = '79000000-0000-4000-8000-000000000005'::uuid
\gset late_failed_

SELECT *
FROM public.commerce_process_wallet_payment_webhook(
  :'late_failed_webhook_inbox_id'::uuid,
  :'late_failed_processing_token'::uuid
);

INSERT INTO public.commerce_webhook_inbox(
  id, provider, provider_event_id, status, headers, payload, payload_hash,
  verification_method, signed_data_hash, attempts, next_attempt_at
) VALUES (
  '79000000-0000-4000-8000-000000000007', 'payos', 'wallet-late-success-001', 'pending', '{}',
  jsonb_build_object(
    'orderCode', :'late_provider_order_code'::bigint,
    'paymentLinkId', 'wallet-provider-late-001',
    'code', '00', 'amount', 150000, 'currency', 'VND'
  ),
  repeat('8',64), 'webhook_signature', repeat('9',64), 0, clock_timestamp()
);
INSERT INTO public.commerce_payment_events(
  id, provider, provider_event_id, provider_payment_id, payment_attempt_id, order_id,
  event_type, signature_valid, verification_method, amount_minor, currency,
  payload_hash, signed_data_hash, payload, occurred_at
) VALUES (
  '79000000-0000-4000-8000-000000000008', 'payos', 'wallet-late-success-001',
  'wallet-provider-late-001', NULL, NULL, 'payment.succeeded', true, 'webhook_signature',
  150000, 'VND', repeat('8',64), repeat('9',64),
  jsonb_build_object(
    'orderCode', :'late_provider_order_code'::bigint,
    'paymentLinkId', 'wallet-provider-late-001',
    'code', '00', 'amount', 150000, 'currency', 'VND'
  ), clock_timestamp()
);

SELECT *
FROM public.commerce_claim_wallet_payment_webhooks(10)
WHERE webhook_inbox_id = '79000000-0000-4000-8000-000000000007'::uuid
\gset late_success_

SELECT *
FROM public.commerce_process_wallet_payment_webhook(
  :'late_success_webhook_inbox_id'::uuid,
  :'late_success_processing_token'::uuid
);

DO $$
DECLARE
  v_late_intent uuid;
BEGIN
  SELECT id INTO v_late_intent
  FROM public.commerce_wallet_topup_intents
  WHERE idempotency_key = 'wallet-topup-late-success-001';

  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_topup_intents
    WHERE id = v_late_intent AND status = 'failed'
  ) THEN
    RAISE EXCEPTION 'Failed Wallet payment did not fail the top-up intent';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_topup_checkouts
    WHERE topup_intent_id = v_late_intent
      AND status = 'recovery_required'
      AND recovery_error_code = 'late_success_requires_review'
  ) THEN
    RAISE EXCEPTION 'Late Wallet success did not enter recovery review';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commerce_wallet_ledger
    WHERE topup_intent_id = v_late_intent
      AND operation = 'topup_credit'
  ) OR EXISTS (
    SELECT 1 FROM public.commerce_wallet_receipts
    WHERE topup_intent_id = v_late_intent
      AND receipt_kind = 'wallet_topup'
  ) THEN
    RAISE EXCEPTION 'Late Wallet success credited a failed top-up automatically';
  END IF;
END
$$;

SELECT jsonb_build_object(
  'wallet_webhook_verified_credit', true,
  'wallet_webhook_replay_safe', true,
  'wallet_provider_lookup_reconciliation', true,
  'wallet_credit_ledger_receipt_once', true,
  'wallet_non_wallet_isolation', true,
  'wallet_late_success_review_required', true,
  'wallet_webhook_reconciliation_pass', true
) AS commerce_wallet_webhook_reconciliation_result;
