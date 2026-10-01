\set ON_ERROR_STOP on

SELECT id AS credited_intent_id
FROM public.commerce_wallet_topup_intents
WHERE idempotency_key = 'wallet-topup-fixed-0001'
\gset

CREATE TEMP TABLE wallet_finance_baseline AS
SELECT available_minor
FROM public.commerce_wallet_accounts
WHERE owner_user_id = '11111111-1111-4111-8111-111111111111';

INSERT INTO public.staff_permission_assignments(
  staff_user_id, module, action, scope_kind, scope_id, granted_by
) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'commerce-finance', 'view', 'global', NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);

DO $$
DECLARE
  v_detail jsonb := public.commerce_get_wallet_support_detail('wallet-provider-payment-1');
BEGIN
  IF v_detail->'topupIntent'->>'id' <> (SELECT id::text FROM public.commerce_wallet_topup_intents WHERE idempotency_key = 'wallet-topup-fixed-0001') THEN
    RAISE EXCEPTION 'support lookup resolved the wrong top-up';
  END IF;
  IF v_detail::text LIKE '%claim_token%'
     OR v_detail::text LIKE '%checkout_url%'
     OR v_detail::text LIKE '%provider_metadata%'
     OR v_detail::text LIKE '%provider_lookup_hash%' THEN
    RAISE EXCEPTION 'support lookup leaked restricted provider data';
  END IF;
  BEGIN
    PERFORM public.commerce_finance_adjust_wallet(
      '11111111-1111-4111-8111-111111111111', 'admin_credit', 10000,
      'support_test', 'unauthorized finance mutation', 'wallet-finance-denied-0001'
    );
    RAISE EXCEPTION 'finance adjustment unexpectedly allowed with view-only permission';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END
$$;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.commerce_finance_adjust_wallet(
      '22222222-2222-4222-8222-222222222222', 'admin_credit', 10000,
      'cross_account', 'owner must not adjust another wallet', 'wallet-finance-owner-denied-0001'
    );
    RAISE EXCEPTION 'wallet owner unexpectedly performed finance adjustment';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
  BEGIN
    PERFORM public.commerce_get_wallet_support_detail('wallet-provider-payment-1');
    RAISE EXCEPTION 'wallet owner unexpectedly accessed support lookup';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END
$$;

RESET ROLE;
INSERT INTO public.staff_permission_assignments(
  staff_user_id, module, action, scope_kind, scope_id, granted_by
) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'commerce-finance', 'edit', 'global', NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);

SELECT public.commerce_finance_adjust_wallet(
  '11111111-1111-4111-8111-111111111111', 'admin_credit', 10000,
  'manual_credit', 'finance fixture credit', 'wallet-finance-credit-0001'
) AS credit_result \gset

SELECT public.commerce_finance_adjust_wallet(
  '11111111-1111-4111-8111-111111111111', 'admin_credit', 10000,
  'manual_credit', 'finance fixture credit', 'wallet-finance-credit-0001'
) AS credit_replay_result \gset

SELECT public.commerce_finance_adjust_wallet(
  '11111111-1111-4111-8111-111111111111', 'admin_debit', 5000,
  'manual_debit', 'finance fixture debit', 'wallet-finance-debit-0001'
) AS debit_result \gset

SELECT public.commerce_finance_adjust_wallet(
  '11111111-1111-4111-8111-111111111111', 'admin_debit', 999999999,
  'manual_debit', 'insufficient fixture balance', 'wallet-finance-blocked-0001'
) AS blocked_result \gset

SELECT public.commerce_finance_open_wallet_chargeback(
  :'credited_intent_id'::uuid, 'provider_dispute', 'review fixture', 'wallet-chargeback-open-0001'
) AS chargeback_open_result \gset

RESET ROLE;
DO $$
BEGIN
  IF (SELECT available_minor FROM public.commerce_wallet_accounts WHERE owner_user_id = '11111111-1111-4111-8111-111111111111') <> (SELECT available_minor + 5000 FROM wallet_finance_baseline) THEN
    RAISE EXCEPTION 'internal adjustments produced the wrong balance';
  END IF;
  IF (SELECT status FROM public.commerce_wallet_finance_cases WHERE idempotency_key = 'wallet-finance-credit-0001') <> 'applied' THEN
    RAISE EXCEPTION 'credit finance case was not applied';
  END IF;
  IF (SELECT count(*) FROM public.commerce_wallet_ledger WHERE idempotency_key LIKE 'finance_case:%' AND operation = 'admin_credit') <> 1 THEN
    RAISE EXCEPTION 'credit replay created a duplicate ledger movement';
  END IF;
  IF (SELECT status FROM public.commerce_wallet_finance_cases WHERE idempotency_key = 'wallet-finance-blocked-0001') <> 'blocked' THEN
    RAISE EXCEPTION 'insufficient debit was not blocked';
  END IF;
  IF (SELECT available_minor FROM public.commerce_wallet_accounts WHERE owner_user_id = '11111111-1111-4111-8111-111111111111') <> (SELECT available_minor + 5000 FROM wallet_finance_baseline) THEN
    RAISE EXCEPTION 'blocked debit changed the wallet balance';
  END IF;
  IF (SELECT status FROM public.commerce_wallet_topup_intents WHERE idempotency_key = 'wallet-topup-fixed-0001') <> 'chargeback_review' THEN
    RAISE EXCEPTION 'chargeback did not move the top-up into review';
  END IF;
END
$$;

RESET ROLE;
SELECT id AS reject_case_id
FROM public.commerce_wallet_finance_cases
WHERE idempotency_key = 'wallet-chargeback-open-0001'
\gset
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SELECT public.commerce_finance_resolve_wallet_chargeback(
  :'reject_case_id'::uuid,
  'reject'
) AS chargeback_reject_result \gset

RESET ROLE;
DO $$
BEGIN
  IF (SELECT status FROM public.commerce_wallet_finance_cases WHERE idempotency_key = 'wallet-chargeback-open-0001') <> 'rejected' THEN
    RAISE EXCEPTION 'chargeback rejection did not resolve the finance case';
  END IF;
  IF (SELECT status FROM public.commerce_wallet_topup_intents WHERE idempotency_key = 'wallet-topup-fixed-0001') <> 'credited' THEN
    RAISE EXCEPTION 'chargeback rejection did not restore credited status';
  END IF;
  IF (SELECT count(*) FROM public.commerce_wallet_ledger WHERE operation = 'chargeback_debit') <> 0 THEN
    RAISE EXCEPTION 'rejected chargeback created a debit';
  END IF;
END
$$;

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);

SELECT topup_intent_id AS apply_intent_id
FROM public.commerce_create_wallet_topup_intent(NULL, 50000, 'wallet-chargeback-apply-topup-0001');
\gset

RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT public.commerce_attach_wallet_topup_payment(:'apply_intent_id'::uuid, 'payos', 'wallet-provider-chargeback-apply-1');
SELECT public.commerce_credit_wallet_topup(:'apply_intent_id'::uuid, 50000, 'VND', 'wallet-provider-chargeback-apply-event-1', 'wallet-provider-chargeback-apply-1', 'wallet-credit-chargeback-apply-0001');

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);

SELECT public.commerce_finance_open_wallet_chargeback(:'apply_intent_id'::uuid, 'provider_dispute', 'apply fixture', 'wallet-chargeback-apply-0001') AS chargeback_apply_open \gset
RESET ROLE;
SELECT id AS apply_case_id
FROM public.commerce_wallet_finance_cases
WHERE idempotency_key = 'wallet-chargeback-apply-0001'
\gset
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SELECT public.commerce_finance_resolve_wallet_chargeback(:'apply_case_id'::uuid, 'apply') AS chargeback_apply_result \gset

RESET ROLE;
DO $$
BEGIN
  IF (SELECT available_minor FROM public.commerce_wallet_accounts WHERE owner_user_id = '11111111-1111-4111-8111-111111111111') <> (SELECT available_minor + 5000 FROM wallet_finance_baseline) THEN
    RAISE EXCEPTION 'applied chargeback produced the wrong balance';
  END IF;
  IF (SELECT status FROM public.commerce_wallet_finance_cases WHERE idempotency_key = 'wallet-chargeback-apply-0001') <> 'applied' THEN
    RAISE EXCEPTION 'chargeback apply did not resolve the finance case';
  END IF;
  IF (SELECT count(*) FROM public.commerce_wallet_ledger WHERE operation = 'chargeback_debit') <> 1 THEN
    RAISE EXCEPTION 'chargeback apply ledger movement is missing or duplicated';
  END IF;
END
$$;

RESET ROLE;
SELECT jsonb_build_object(
  'support_view_sanitized', true,
  'finance_view_edit_boundary', true,
  'adjustment_idempotent', true,
  'insufficient_balance_blocked', true,
  'chargeback_reject_preserved_balance', true,
  'chargeback_apply_debited_once', true,
  'finance_cross_account_boundary', true,
  'wallet_finance_support_pass', true
) AS commerce_wallet_finance_support_result;
