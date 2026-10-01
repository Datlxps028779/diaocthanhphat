-- Commerce foundation post-migration verification. READ ONLY.

WITH expected(name) AS (
  VALUES
    ('commerce_packages'), ('commerce_package_versions'), ('commerce_orders'),
    ('commerce_order_items'), ('commerce_payment_attempts'), ('commerce_payment_events'),
    ('commerce_webhook_inbox'), ('commerce_refunds'), ('commerce_invoices'),
    ('commerce_subscriptions'), ('commerce_subscription_periods'), ('commerce_entitlements'),
    ('commerce_quota_reservations'),
    ('commerce_quota_ledger'), ('commerce_audit_events'), ('commerce_outbox')
), tables AS (
  SELECT e.name, c.oid, coalesce(c.relrowsecurity, false) AS rls_enabled
  FROM expected e
  LEFT JOIN pg_class c ON c.oid = to_regclass(format('public.%I', e.name))
), unsafe_grants AS (
  SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name LIKE 'commerce_%'
    AND grantee IN ('anon','authenticated')
    AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES')
), owner_policies AS (
  SELECT tablename, policyname
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'commerce_orders','commerce_order_items','commerce_payment_attempts','commerce_refunds',
      'commerce_invoices','commerce_subscriptions','commerce_subscription_periods',
      'commerce_entitlements','commerce_quota_reservations','commerce_quota_ledger'
    )
    AND cmd = 'SELECT'
), entitlement_columns AS (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'commerce_entitlements'
    AND column_name IN ('benefit_kind','status','quantity_total','quantity_remaining','duration_days','starts_at','ends_at','subscription_period_id')
), webhook_columns AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('commerce_payment_events', 'commerce_webhook_inbox')
    AND column_name IN (
      'provider_payment_id', 'payload_hash', 'verification_method',
      'signed_data_hash', 'provider_lookup_hash', 'payload'
    )
), webhook_verification_constraints AS (
  SELECT c.conname
  FROM pg_constraint c
  WHERE c.conname IN (
    'commerce_payment_events_verification_source',
    'commerce_webhook_inbox_verification_source'
  )
    AND c.contype = 'c'
), guard_functions AS (
  SELECT
    p.proname,
    p.prosecdef,
    p.proconfig,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'guard_commerce_order_identity_immutable',
      'guard_commerce_order_item_identity_immutable',
      'guard_commerce_subscription_identity_immutable',
      'guard_commerce_subscription_period_consistency',
      'guard_commerce_entitlement_consistency'
    )
), expected_guard_triggers(trigger_name, table_name, function_name, expected_tgtype) AS (
  VALUES
    ('trg_commerce_order_identity_immutable', 'commerce_orders', 'guard_commerce_order_identity_immutable', 19),
    ('trg_commerce_order_item_identity_immutable', 'commerce_order_items', 'guard_commerce_order_item_identity_immutable', 19),
    ('trg_commerce_subscription_identity_immutable', 'commerce_subscriptions', 'guard_commerce_subscription_identity_immutable', 19),
    ('trg_commerce_subscription_period_consistency', 'commerce_subscription_periods', 'guard_commerce_subscription_period_consistency', 23),
    ('trg_commerce_entitlement_consistency', 'commerce_entitlements', 'guard_commerce_entitlement_consistency', 23)
), guard_triggers AS (
  SELECT
    e.trigger_name,
    e.table_name,
    e.function_name,
    e.expected_tgtype,
    t.oid,
    t.tgenabled,
    t.tgtype AS actual_tgtype,
    n.oid AS namespace_oid,
    c.relname AS actual_table_name,
    p.proname AS actual_function_name
  FROM expected_guard_triggers e
  LEFT JOIN pg_trigger t ON t.tgname = e.trigger_name AND NOT t.tgisinternal
  LEFT JOIN pg_class c ON c.oid = t.tgrelid
  LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  LEFT JOIN pg_proc p ON p.oid = t.tgfoid
), package_benefit_validator AS (
  SELECT
    p.provolatile,
    p.proconfig,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'commerce_package_benefits_valid'
), package_benefit_constraint AS (
  SELECT pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
  WHERE c.conrelid = 'public.commerce_package_versions'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%commerce_package_benefits_valid%'
), period_constraints AS (
  SELECT string_agg(pg_get_constraintdef(c.oid), ' ') AS definitions
  FROM pg_constraint c
  WHERE c.conrelid = 'public.commerce_subscription_periods'::regclass
    AND c.contype = 'c'
), exact_grace_constraint AS (
  SELECT pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
  WHERE c.conrelid = 'public.commerce_subscription_periods'::regclass
    AND c.conname = 'commerce_subscription_periods_grace_exact'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%grace_until =%period_end%3 days%'
    AND pg_get_constraintdef(c.oid) NOT ILIKE '%grace_until >=%'
    AND pg_get_constraintdef(c.oid) NOT ILIKE '%grace_until <=%'
), results AS (
  SELECT
    (SELECT count(*) FROM tables WHERE oid IS NOT NULL) = 16 AS all_tables_exist,
    (SELECT bool_and(rls_enabled) FROM tables WHERE oid IS NOT NULL) AND (SELECT count(*) FROM tables WHERE oid IS NOT NULL) = 16 AS all_tables_rls,
    NOT EXISTS (SELECT 1 FROM unsafe_grants) AS no_client_write_grants,
    (SELECT count(DISTINCT tablename) FROM owner_policies) = 10 AS owner_read_policies_present,
    (SELECT count(*) FROM entitlement_columns) = 8 AS entitlement_contract_present,
    (
      SELECT count(*) = 1
        AND bool_and(provolatile = 'i')
        AND bool_and('search_path=pg_catalog, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
        AND bool_and(NOT anon_execute)
        AND bool_and(NOT authenticated_execute)
      FROM package_benefit_validator
    ) AND EXISTS (SELECT 1 FROM package_benefit_constraint)
      AS package_benefit_contract_present,
    (SELECT count(*) FROM webhook_columns) = 11
      AND (SELECT count(*) FROM webhook_verification_constraints) = 2
      AS signed_webhook_contract_present,
    (
      SELECT count(*) = 5
        AND bool_and(prosecdef)
        AND bool_and('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
        AND bool_and(NOT anon_execute)
        AND bool_and(NOT authenticated_execute)
      FROM guard_functions
    ) AS subscription_guards_hardened,
    NOT EXISTS (
      SELECT 1 FROM guard_triggers
      WHERE oid IS NULL
         OR tgenabled <> 'O'
         OR actual_tgtype IS DISTINCT FROM expected_tgtype
         OR namespace_oid IS NULL
         OR actual_table_name IS DISTINCT FROM table_name
         OR actual_function_name IS DISTINCT FROM function_name
    ) AS subscription_guard_triggers_present,
    (
      (SELECT count(*) FROM exact_grace_constraint) = 1
      AND (
        SELECT COALESCE(definitions, '') ILIKE '%isfinite(period_start)%'
          AND COALESCE(definitions, '') ILIKE '%isfinite(period_end)%'
          AND COALESCE(definitions, '') ILIKE '%isfinite(grace_until)%'
        FROM period_constraints
      )
    ) AS exact_grace_constraint_present,
    NOT EXISTS (SELECT 1 FROM public.commerce_packages) AS no_unapproved_package_seed
)
SELECT *,
  (all_tables_exist AND all_tables_rls AND no_client_write_grants
   AND owner_read_policies_present AND entitlement_contract_present
   AND package_benefit_contract_present AND signed_webhook_contract_present
   AND subscription_guards_hardened AND subscription_guard_triggers_present
   AND exact_grace_constraint_present AND no_unapproved_package_seed) AS commerce_foundation_verify_pass
FROM results;

SELECT name AS missing_table
FROM (VALUES
  ('commerce_packages'), ('commerce_package_versions'), ('commerce_orders'),
  ('commerce_order_items'), ('commerce_payment_attempts'), ('commerce_payment_events'),
  ('commerce_webhook_inbox'), ('commerce_refunds'), ('commerce_invoices'),
  ('commerce_subscriptions'), ('commerce_subscription_periods'), ('commerce_entitlements'),
  ('commerce_quota_reservations'), ('commerce_quota_ledger'),
  ('commerce_audit_events'), ('commerce_outbox')
) AS expected(name)
WHERE to_regclass(format('public.%I', name)) IS NULL;

SELECT * FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name LIKE 'commerce_%'
  AND grantee IN ('anon','authenticated')
  AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES')
ORDER BY table_name, grantee, privilege_type;
