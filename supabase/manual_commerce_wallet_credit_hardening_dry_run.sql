-- Commerce wallet credit hardening preflight. READ ONLY.

WITH prerequisites AS (
  SELECT
    to_regclass('public.commerce_wallet_topup_intents') IS NOT NULL AS has_topup_intents,
    to_regclass('public.commerce_wallet_ledger') IS NOT NULL AS has_wallet_ledger,
    to_regclass('public.commerce_wallet_receipts') IS NOT NULL AS has_wallet_receipts,
    to_regprocedure('public.commerce_attach_wallet_topup_payment(uuid,text,text)') IS NOT NULL AS has_attach_rpc,
    to_regprocedure('public.commerce_credit_wallet_topup(uuid,bigint,text,text,text,text)') IS NOT NULL AS has_credit_rpc
), duplicate_ledgers AS (
  SELECT topup_intent_id
  FROM public.commerce_wallet_ledger
  WHERE operation = 'topup_credit'
  GROUP BY topup_intent_id
  HAVING count(*) > 1
), duplicate_receipts AS (
  SELECT topup_intent_id
  FROM public.commerce_wallet_receipts
  WHERE receipt_kind = 'wallet_topup'
  GROUP BY topup_intent_id
  HAVING count(*) > 1
), credited_without_ledger AS (
  SELECT i.id
  FROM public.commerce_wallet_topup_intents i
  WHERE i.status = 'credited'
    AND NOT EXISTS (
      SELECT 1 FROM public.commerce_wallet_ledger l
      WHERE l.operation = 'topup_credit' AND l.topup_intent_id = i.id
    )
), credited_without_receipt AS (
  SELECT i.id
  FROM public.commerce_wallet_topup_intents i
  WHERE i.status = 'credited'
    AND NOT EXISTS (
      SELECT 1 FROM public.commerce_wallet_receipts r
      WHERE r.receipt_kind = 'wallet_topup' AND r.topup_intent_id = i.id
    )
), credit_for_uncredited AS (
  SELECT i.id
  FROM public.commerce_wallet_topup_intents i
  WHERE i.status <> 'credited'
    AND EXISTS (
      SELECT 1 FROM public.commerce_wallet_ledger l
      WHERE l.operation = 'topup_credit' AND l.topup_intent_id = i.id
    )
), results AS (
  SELECT
    p.*,
    (SELECT count(*) FROM duplicate_ledgers) AS duplicate_credit_ledger_intents,
    (SELECT count(*) FROM duplicate_receipts) AS duplicate_topup_receipt_intents,
    (SELECT count(*) FROM credited_without_ledger) AS credited_without_ledger_count,
    (SELECT count(*) FROM credited_without_receipt) AS credited_without_receipt_count,
    (SELECT count(*) FROM credit_for_uncredited) AS credit_for_uncredited_count
  FROM prerequisites p
)
SELECT jsonb_build_object(
  'has_topup_intents', has_topup_intents,
  'has_wallet_ledger', has_wallet_ledger,
  'has_wallet_receipts', has_wallet_receipts,
  'has_attach_rpc', has_attach_rpc,
  'has_credit_rpc', has_credit_rpc,
  'duplicate_credit_ledger_intents', duplicate_credit_ledger_intents,
  'duplicate_topup_receipt_intents', duplicate_topup_receipt_intents,
  'credited_without_ledger_count', credited_without_ledger_count,
  'credited_without_receipt_count', credited_without_receipt_count,
  'credit_for_uncredited_count', credit_for_uncredited_count,
  'commerce_wallet_credit_hardening_preflight_pass', (
    has_topup_intents
    AND has_wallet_ledger
    AND has_wallet_receipts
    AND has_attach_rpc
    AND has_credit_rpc
    AND duplicate_credit_ledger_intents = 0
    AND duplicate_topup_receipt_intents = 0
    AND credited_without_ledger_count = 0
    AND credited_without_receipt_count = 0
    AND credit_for_uncredited_count = 0
  )
) AS commerce_wallet_credit_hardening_preflight
FROM results;
