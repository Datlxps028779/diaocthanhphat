-- Commerce closed-rollout preflight. READ ONLY.
-- Run before applying 20261015020000_commerce_closed_rollout_guards.sql.

WITH counts AS (
  SELECT
    (SELECT count(*) FROM public.commerce_wallet_topup_options WHERE is_active = true) AS active_topup_options,
    (SELECT count(*) FROM public.commerce_fee_products WHERE is_active = true OR is_default = true) AS active_or_default_fee_products,
    (SELECT count(*) FROM public.commerce_fee_product_rules WHERE is_active = true) AS active_fee_rules,
    (SELECT count(*) FROM public.commerce_wallet_topup_config WHERE id = true AND is_active = true) AS active_topup_config,
    (SELECT count(*) FROM public.commerce_wallet_topup_config
      WHERE id = true
        AND (
          custom_amount_enabled IS DISTINCT FROM false
          OR custom_min_minor IS NOT NULL
          OR custom_max_minor IS NOT NULL
          OR custom_step_minor IS NOT NULL
        )) AS custom_amount_configs
)
SELECT jsonb_build_object(
  'active_topup_options', active_topup_options,
  'active_or_default_fee_products', active_or_default_fee_products,
  'active_fee_rules', active_fee_rules,
  'active_topup_config', active_topup_config,
  'custom_amount_configs', custom_amount_configs,
  'preflight_pass', (
    active_topup_options = 0
    AND active_or_default_fee_products = 0
    AND active_fee_rules = 0
    AND active_topup_config = 0
    AND custom_amount_configs = 0
  )
)
FROM counts;
