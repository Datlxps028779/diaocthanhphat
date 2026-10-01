\set ON_ERROR_STOP on

INSERT INTO public.commerce_wallet_topup_config(
  id, is_active, custom_amount_enabled,
  custom_min_minor, custom_max_minor, custom_step_minor
) VALUES (true, true, true, 10000, 1000000, 1000);

INSERT INTO public.commerce_wallet_topup_options(
  id, code, label, amount_minor, currency, is_active, sort_order
) VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'topup_100k', 'Nạp 100.000đ', 100000, 'VND', true, 1
);

INSERT INTO public.commerce_fee_products(
  id, code, version, name, product_kind, amount_minor, currency,
  duration_days, placement_code, sponsored_label,
  terms_version, is_active, is_default, valid_from
) VALUES
  ('a2000000-0000-4000-8000-000000000001', 'listing_basic_30d', 1, 'Tin cơ bản 30 ngày', 'listing_basic', 5000, 'VND', 30, NULL, NULL, 'wallet-e2e-v1', true, true, now() - interval '1 minute'),
  ('a2000000-0000-4000-8000-000000000002', 'sponsored_30d', 1, 'Tài trợ 30 ngày', 'sponsored_addon', 2000, 'VND', 30, 'listing_top', 'Tài trợ', 'wallet-e2e-v1', true, false, now() - interval '1 minute');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

SELECT topup_intent_id AS fixed_intent_id
FROM public.commerce_create_wallet_topup_intent(
  'topup_100k', NULL, 'wallet-topup-fixed-0001'
) \gset

SELECT topup_intent_id AS fixed_replay_id
FROM public.commerce_create_wallet_topup_intent(
  'topup_100k', NULL, 'wallet-topup-fixed-0001'
) \gset

SELECT topup_intent_id AS custom_intent_id
FROM public.commerce_create_wallet_topup_intent(
  NULL, 250000, 'wallet-topup-custom-001'
) \gset

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.commerce_create_wallet_topup_intent(
      NULL, 250500, 'wallet-topup-invalid-01'
    );
    RAISE EXCEPTION 'invalid custom amount unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
  BEGIN
    UPDATE public.commerce_wallet_accounts
    SET available_minor = 999999
    WHERE owner_user_id = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'authenticated direct wallet write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT public.commerce_attach_wallet_topup_payment(
  :'fixed_intent_id'::uuid, 'payos', 'wallet-provider-payment-1'
);
SELECT public.commerce_credit_wallet_topup(
  :'fixed_intent_id'::uuid,
  100000,
  'VND',
  'wallet-provider-event-1',
  'wallet-provider-payment-1',
  'wallet-credit-event-0001'
) AS credit_result \gset
SELECT public.commerce_credit_wallet_topup(
  :'fixed_intent_id'::uuid,
  100000,
  'VND',
  'wallet-provider-event-2',
  'wallet-provider-payment-1',
  'wallet-credit-event-0002'
) AS credit_replay_result \gset

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.commerce_attach_wallet_topup_payment(
      (SELECT id FROM public.commerce_wallet_topup_intents WHERE idempotency_key = 'wallet-topup-fixed-0001'),
      'payos',
      'wallet-provider-payment-wrong'
    );
    RAISE EXCEPTION 'credited intent accepted another provider identity';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$$;

RESET ROLE;
DO $$
DECLARE
  v_wallet public.commerce_wallet_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_wallet
  FROM public.commerce_wallet_accounts
  WHERE owner_user_id = '11111111-1111-4111-8111-111111111111';

  IF v_wallet.available_minor <> 175000 OR v_wallet.reserved_minor <> 0 THEN
    RAISE EXCEPTION 'wallet balance is wrong after top-up credit';
  END IF;
  IF (SELECT count(*) FROM public.commerce_wallet_topup_intents WHERE idempotency_key = 'wallet-topup-fixed-0001') <> 1 THEN
    RAISE EXCEPTION 'fixed top-up idempotency duplicated intent';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_topup_intents
    WHERE idempotency_key = 'wallet-topup-fixed-0001' AND status = 'credited'
  ) THEN
    RAISE EXCEPTION 'wallet top-up intent was not credited';
  END IF;
  IF (SELECT count(*) FROM public.commerce_wallet_ledger WHERE operation = 'topup_credit') <> 1 THEN
    RAISE EXCEPTION 'wallet top-up ledger duplicated';
  END IF;
  IF (SELECT count(*) FROM public.commerce_wallet_receipts WHERE receipt_kind = 'wallet_topup') <> 1 THEN
    RAISE EXCEPTION 'wallet top-up receipt missing or duplicated';
  END IF;
END
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
DO $$
DECLARE v_snapshot jsonb := public.commerce_get_my_wallet_snapshot();
BEGIN
  IF (v_snapshot->'wallet'->>'available_minor')::bigint <> 0
     OR jsonb_array_length(v_snapshot->'ledger') <> 0 THEN
    RAISE EXCEPTION 'wallet snapshot leaked another owner data';
  END IF;
END
$$;

RESET ROLE;
SELECT jsonb_build_object(
  'fixed_option_intent', true,
  'custom_amount_intent', true,
  'server_limit_rejected', true,
  'wallet_credit', true,
  'credit_idempotent', true,
  'owner_isolation', true,
  'wallet_topup_pass', true
) AS commerce_wallet_topup_result;
