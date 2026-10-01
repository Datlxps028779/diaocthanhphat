-- Commerce Wallet closed-config preflight. READ ONLY.
-- Run this before the apply script in the target Supabase project.

WITH state AS (
  SELECT
    to_regclass('public.commerce_wallet_topup_config') IS NOT NULL AS table_exists,
    (SELECT count(*) FROM public.commerce_wallet_topup_config) AS row_count,
    (SELECT is_active FROM public.commerce_wallet_topup_config WHERE id = true) AS is_active,
    (SELECT custom_amount_enabled FROM public.commerce_wallet_topup_config WHERE id = true) AS custom_amount_enabled,
    (SELECT custom_min_minor FROM public.commerce_wallet_topup_config WHERE id = true) AS custom_min_minor,
    (SELECT custom_max_minor FROM public.commerce_wallet_topup_config WHERE id = true) AS custom_max_minor,
    (SELECT custom_step_minor FROM public.commerce_wallet_topup_config WHERE id = true) AS custom_step_minor
)
SELECT jsonb_build_object(
  'table_exists', table_exists,
  'row_count', row_count,
  'existing_config_closed', (
    is_active IS FALSE
    AND custom_amount_enabled IS FALSE
    AND custom_min_minor IS NULL
    AND custom_max_minor IS NULL
    AND custom_step_minor IS NULL
  ),
  'will_insert_closed_config', table_exists AND row_count = 0,
  'preflight_pass', table_exists AND (
    row_count = 0
    OR (
      is_active IS FALSE
      AND custom_amount_enabled IS FALSE
      AND custom_min_minor IS NULL
      AND custom_max_minor IS NULL
      AND custom_step_minor IS NULL
    )
  )
)
FROM state;
