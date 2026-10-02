-- Commerce closed-rollout verification. READ ONLY.
-- Run after the migration has been applied by the operator.

WITH functions AS (
  SELECT
    p.oid,
    p.prosecdef,
    p.proconfig,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  WHERE p.oid IN (
    to_regprocedure('public.commerce_admin_update_wallet_topup_config(boolean,boolean,bigint,bigint,bigint)'),
    to_regprocedure('public.commerce_admin_save_wallet_topup_option(uuid,text,text,bigint,boolean,integer)'),
    to_regprocedure('public.commerce_admin_save_fee_product(uuid,text,integer,text,text,text,bigint,integer,text,text,text,boolean,boolean,timestamptz,timestamptz)'),
    to_regprocedure('public.commerce_admin_save_fee_product_rule(uuid,uuid,text,uuid,integer,boolean,timestamptz,timestamptz)'),
    to_regprocedure('public.approve_user_listing_with_fee_decision(uuid,text,text,text,text)')
  )
), resolver_function AS (
  SELECT
    p.prosecdef,
    p.proconfig,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.commerce_resolve_listing_fee_product(uuid,text)')
), unsafe_grants AS (
  SELECT 1
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN (
      'commerce_wallet_topup_config',
      'commerce_wallet_topup_options',
      'commerce_fee_products',
      'commerce_fee_product_rules',
      'commerce_listing_approval_fee_decisions'
    )
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
), closed_constraints AS (
  SELECT
    to_regclass('public.commerce_wallet_topup_options') IS NOT NULL
      AND to_regclass('public.commerce_fee_products') IS NOT NULL
      AND to_regclass('public.commerce_fee_product_rules') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.commerce_wallet_topup_options'::regclass
          AND conname = 'commerce_wallet_topup_options_closed_rollout_inactive_check'
      )
      AND EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.commerce_fee_products'::regclass
          AND conname = 'commerce_fee_products_closed_rollout_inactive_check'
      )
      AND EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.commerce_fee_products'::regclass
          AND conname = 'commerce_fee_products_closed_rollout_default_check'
      )
      AND EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.commerce_fee_product_rules'::regclass
          AND conname = 'commerce_fee_product_rules_closed_rollout_inactive_check'
      ) AS constraints_present
), results AS (
  SELECT
    (SELECT count(*) = 5
      AND bool_and(prosecdef)
      AND bool_and('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
      AND bool_and(authenticated_execute)
      AND bool_and(NOT anon_execute)
      FROM functions) AS functions_hardened,
    (SELECT count(*) = 1
      AND bool_and(prosecdef)
      AND bool_and('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
      AND bool_and(NOT anon_execute)
      AND bool_and(definition LIKE '%Paid listing approval is not available in this rollout.%')
      FROM resolver_function) AS resolver_hardened,
    NOT EXISTS (SELECT 1 FROM unsafe_grants) AS no_client_table_grants,
    (SELECT constraints_present FROM closed_constraints) AS closed_constraints_present,
    NOT EXISTS (
      SELECT 1 FROM public.commerce_wallet_topup_options WHERE is_active = true
    ) AS no_active_topup_options,
    NOT EXISTS (
      SELECT 1 FROM public.commerce_fee_products WHERE is_active = true OR is_default = true
    ) AS no_active_or_default_fee_products,
    NOT EXISTS (
      SELECT 1 FROM public.commerce_fee_product_rules WHERE is_active = true
    ) AS no_active_fee_rules,
    NOT COALESCE((SELECT is_active FROM public.commerce_wallet_topup_config WHERE id = true), false)
      AS topup_activation_closed,
    NOT EXISTS (
      SELECT 1 FROM public.commerce_wallet_topup_config
      WHERE id = true
        AND (
          custom_amount_enabled IS DISTINCT FROM false
          OR custom_min_minor IS NOT NULL
          OR custom_max_minor IS NOT NULL
          OR custom_step_minor IS NOT NULL
        )
    ) AS fixed_amount_only,
    NOT EXISTS (
      SELECT 1 FROM public.commerce_wallet_receipts
      WHERE document_type IS DISTINCT FROM 'internal_receipt'
    ) AS wallet_receipts_internal_only,
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.commerce_listing_approval_fee_decisions'::regclass
        AND tgname = 'commerce_closed_rollout_reject_paid_approval'
        AND NOT tgisinternal
    ) AS paid_decision_trigger_present
)
SELECT jsonb_build_object(
  'functions_hardened', functions_hardened,
  'no_client_table_grants', no_client_table_grants,
  'closed_constraints_present', closed_constraints_present,
  'no_active_topup_options', no_active_topup_options,
  'no_active_or_default_fee_products', no_active_or_default_fee_products,
  'no_active_fee_rules', no_active_fee_rules,
  'topup_activation_closed', topup_activation_closed,
  'fixed_amount_only', fixed_amount_only,
  'wallet_receipts_internal_only', wallet_receipts_internal_only,
  'paid_decision_trigger_present', paid_decision_trigger_present,
  'paid_resolver_guard_present', resolver_hardened,
  'commerce_closed_rollout_verify_pass', (
    functions_hardened
    AND resolver_hardened
    AND no_client_table_grants
    AND closed_constraints_present
    AND no_active_topup_options
    AND no_active_or_default_fee_products
    AND no_active_fee_rules
    AND topup_activation_closed
    AND fixed_amount_only
    AND wallet_receipts_internal_only
    AND paid_decision_trigger_present
    AND resolver_hardened
  )
)
FROM results;
