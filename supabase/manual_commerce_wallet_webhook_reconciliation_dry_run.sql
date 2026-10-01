-- Commerce Wallet webhook/reconciliation preflight. READ ONLY.

WITH prerequisites AS (
  SELECT
    to_regclass('public.commerce_wallet_topup_checkouts') IS NOT NULL AS has_wallet_checkouts,
    to_regclass('public.commerce_webhook_inbox') IS NOT NULL AS has_webhook_inbox,
    to_regclass('public.commerce_payment_events') IS NOT NULL AS has_payment_events,
    to_regprocedure('public.commerce_credit_wallet_topup(uuid,bigint,text,text,text,text)') IS NOT NULL AS has_credit_rpc,
    to_regprocedure('public.commerce_claim_payment_webhooks(integer)') IS NOT NULL AS has_payment_claim_rpc
), planned_tables(name) AS (
  VALUES ('commerce_wallet_topup_reconciliation_jobs')
), collisions AS (
  SELECT name, to_regclass(format('public.%I', name)) IS NOT NULL AS already_exists
  FROM planned_tables
)
SELECT jsonb_build_object(
  'has_wallet_checkouts', has_wallet_checkouts,
  'has_webhook_inbox', has_webhook_inbox,
  'has_payment_events', has_payment_events,
  'has_credit_rpc', has_credit_rpc,
  'has_payment_claim_rpc', has_payment_claim_rpc,
  'planned_table_collisions', (SELECT count(*) FROM collisions WHERE already_exists),
  'commerce_wallet_webhook_reconciliation_preflight_pass', (
    has_wallet_checkouts
    AND has_webhook_inbox
    AND has_payment_events
    AND has_credit_rpc
    AND has_payment_claim_rpc
    AND NOT EXISTS (SELECT 1 FROM collisions WHERE already_exists)
  )
) AS commerce_wallet_webhook_reconciliation_preflight
FROM prerequisites;
