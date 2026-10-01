-- Read-only preflight for Wallet finance/support migration.
SELECT jsonb_build_object(
  'commerce_wallet_finance_support_preflight_pass',
  to_regclass('public.commerce_wallet_accounts') IS NOT NULL
  AND to_regclass('public.commerce_wallet_topup_intents') IS NOT NULL
  AND to_regclass('public.commerce_wallet_topup_checkouts') IS NOT NULL
  AND to_regclass('public.commerce_wallet_topup_reconciliation_jobs') IS NOT NULL
  AND to_regprocedure('public.has_staff_permission(text,text,uuid,uuid,uuid,uuid)') IS NOT NULL
  AND to_regprocedure('public.commerce_finance_adjust_wallet(uuid,text,bigint,text,text,text)') IS NULL
  AND to_regprocedure('public.commerce_get_wallet_support_detail(text)') IS NULL
) AS commerce_wallet_finance_support_preflight;
