-- Commerce wallet top-up checkout preflight. READ ONLY.

WITH prerequisites AS (
  SELECT
    to_regclass('public.commerce_wallet_topup_intents') IS NOT NULL AS has_topup_intents,
    to_regclass('public.commerce_payment_attempts') IS NOT NULL AS has_payment_attempts,
    to_regclass('public.commerce_audit_events') IS NOT NULL AS has_audit_events,
    to_regprocedure('public.commerce_attach_wallet_topup_payment(uuid,text,text)') IS NOT NULL AS has_attach_topup_rpc,
    pg_get_serial_sequence('public.commerce_payment_attempts', 'provider_order_code') IS NOT NULL AS has_provider_order_sequence,
    to_regclass('public.commerce_wallet_topup_checkouts') IS NULL AS no_table_collision
), sequence_settings AS (
  SELECT
    s.seqcycle,
    s.seqmax
  FROM pg_sequence s
  WHERE s.seqrelid = to_regclass(pg_get_serial_sequence('public.commerce_payment_attempts', 'provider_order_code'))
), results AS (
  SELECT
    p.*,
    COALESCE((SELECT NOT seqcycle FROM sequence_settings), false) AS provider_sequence_does_not_cycle,
    COALESCE((SELECT seqmax >= 9007199254740991 FROM sequence_settings), false) AS provider_sequence_has_safe_capacity,
    NOT EXISTS (
      SELECT 1 FROM public.commerce_payment_attempts
      WHERE provider_order_code NOT BETWEEN 1 AND 9007199254740991
    ) AS existing_provider_codes_safe
  FROM prerequisites p
)
SELECT jsonb_build_object(
  'has_topup_intents', has_topup_intents,
  'has_payment_attempts', has_payment_attempts,
  'has_audit_events', has_audit_events,
  'has_attach_topup_rpc', has_attach_topup_rpc,
  'has_provider_order_sequence', has_provider_order_sequence,
  'no_table_collision', no_table_collision,
  'provider_sequence_does_not_cycle', provider_sequence_does_not_cycle,
  'provider_sequence_has_safe_capacity', provider_sequence_has_safe_capacity,
  'existing_provider_codes_safe', existing_provider_codes_safe,
  'commerce_wallet_topup_checkout_preflight_pass', (
    has_topup_intents
    AND has_payment_attempts
    AND has_audit_events
    AND has_attach_topup_rpc
    AND has_provider_order_sequence
    AND no_table_collision
    AND provider_sequence_does_not_cycle
    AND provider_sequence_has_safe_capacity
    AND existing_provider_codes_safe
  )
) AS commerce_wallet_topup_checkout_preflight
FROM results;
