-- Chỉ đọc metadata; không gọi RPC nghiệp vụ. Thiếu bảng/function luôn trả FAIL.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH expected_functions(signature, authenticated_expected, definer_expected) AS (
  VALUES
    ('public.commerce_get_listing_approval_fee_options(uuid)', true, true),
    ('public.commerce_resolve_listing_fee_product(uuid,text)', false, true),
    ('public.commerce_admin_get_fee_product_rules()', true, true),
    ('public.commerce_admin_save_fee_product_rule(uuid,uuid,text,uuid,integer,boolean,timestamp with time zone,timestamp with time zone)', true, true),
    ('public.commerce_reserve_listing_fee_for_approval_internal(uuid,uuid,uuid,uuid,text,integer)', false, true),
    ('public.approve_user_listing_with_fee_decision(uuid,text,text,text,text)', true, true),
    ('public.commerce_capture_listing_fee_internal(uuid,uuid)', false, true),
    ('public.commerce_release_listing_fee_internal(uuid,uuid,text)', false, true),
    ('public.sync_commerce_wallet_listing_fee_lifecycle()', false, true),
    ('public.guard_commerce_listing_approval_fee_decision_append_only()', false, false)
), function_state AS (
  SELECT e.*, p.oid IS NOT NULL AS present,
    p.prosecdef AS security_definer,
    p.proconfig,
    COALESCE(has_function_privilege('anon', p.oid, 'EXECUTE'), false) AS anon_execute,
    COALESCE(has_function_privilege('authenticated', p.oid, 'EXECUTE'), false) AS authenticated_execute,
    COALESCE(has_function_privilege('service_role', p.oid, 'EXECUTE'), false) AS service_role_execute,
    EXISTS (
      SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) AS public_execute
  FROM expected_functions e
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
), expected_tables(table_name, deny_client_read) AS (
  VALUES
    ('commerce_fee_product_rules', true),
    ('commerce_listing_approval_fee_decisions', true),
    ('commerce_fee_products', false),
    ('commerce_wallet_accounts', false),
    ('commerce_wallet_fee_reservations', false),
    ('commerce_wallet_ledger', false),
    ('commerce_wallet_receipts', false),
    ('commerce_audit_events', true),
    ('commerce_wallet_topup_config', false),
    ('commerce_packages', false)
), table_state AS (
  SELECT e.*, c.oid IS NOT NULL AS present, COALESCE(c.relrowsecurity, false) AS rls_enabled,
    EXISTS (
      SELECT 1 FROM (VALUES ('anon'), ('authenticated')) roles(name)
      CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) privileges(name)
      WHERE has_table_privilege(roles.name, c.oid, privileges.name)
    ) OR EXISTS (
      SELECT 1 FROM (VALUES ('anon'), ('authenticated')) roles(name)
      CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('REFERENCES')) privileges(name)
      WHERE has_any_column_privilege(roles.name, c.oid, privileges.name)
    ) AS client_can_write,
    COALESCE(has_table_privilege('anon', c.oid, 'SELECT'), false)
      OR COALESCE(has_table_privilege('authenticated', c.oid, 'SELECT'), false)
      OR COALESCE(has_any_column_privilege('anon', c.oid, 'SELECT'), false)
      OR COALESCE(has_any_column_privilege('authenticated', c.oid, 'SELECT'), false)
      AS client_can_read,
    EXISTS (
      SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
      WHERE a.grantee = 0
    ) AS public_has_grant
  FROM expected_tables e
  LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || e.table_name) AND c.relkind = 'r'
), expected_triggers(table_name, trigger_name, function_signature, trigger_type) AS (
  VALUES
    ('user_listings', 'trg_commerce_wallet_listing_fee_lifecycle', 'public.sync_commerce_wallet_listing_fee_lifecycle()', 21),
    ('user_listings', 'trg_commerce_wallet_listing_fee_delete', 'public.sync_commerce_wallet_listing_fee_lifecycle()', 11),
    ('commerce_listing_approval_fee_decisions', 'trg_commerce_listing_approval_fee_decision_append_only', 'public.guard_commerce_listing_approval_fee_decision_append_only()', 27)
), trigger_state AS (
  SELECT e.*, t.oid IS NOT NULL AS present,
    COALESCE(t.tgenabled IN ('O', 'A') AND t.tgtype = e.trigger_type
      AND t.tgfoid = to_regprocedure(e.function_signature), false) AS matches_contract
  FROM expected_triggers e
  LEFT JOIN pg_trigger t ON t.tgrelid = to_regclass('public.' || e.table_name)
    AND t.tgname = e.trigger_name AND NOT t.tgisinternal
), constraints AS (
  SELECT c.conname, c.contype, pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
  WHERE c.conrelid = to_regclass('public.commerce_listing_approval_fee_decisions')
    AND c.convalidated
), data_state AS (
  SELECT
    (SELECT count(*) FROM public.commerce_listing_approval_fee_decisions d
      LEFT JOIN public.user_listings l ON l.id = d.user_listing_id
      WHERE l.id IS NULL) AS orphan_approval_decision_count,
    (SELECT count(*) FROM public.commerce_wallet_fee_reservations r
      LEFT JOIN public.user_listings l ON l.id = r.user_listing_id
      WHERE r.status = 'reserved' AND l.id IS NULL) AS orphan_active_fee_reservation_count,
    (SELECT count(*)
      FROM public.commerce_audit_events a
      WHERE a.entity_type = 'user_listing'
        AND a.event_type IN ('listing_approved_free', 'listing_approved_paid')
        AND a.after_state ? 'property_id'
        AND NULLIF(a.after_state->>'property_id', '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.user_listings l WHERE l.id = a.entity_id
        )
        AND EXISTS (
          SELECT 1 FROM public.properties p
          WHERE p.id = NULLIF(a.after_state->>'property_id', '')::uuid
            AND p.is_active = true
        )) AS orphan_active_approved_property_count,
    (SELECT count(*)
      FROM public.commerce_listing_approval_fee_decisions d
      JOIN public.commerce_wallet_fee_reservations r
        ON r.user_listing_id = d.user_listing_id
       AND r.owner_user_id = d.owner_user_id
      WHERE d.fee_mode = 'free' AND r.status = 'reserved') AS free_decision_with_active_reservation_count,
    (SELECT COALESCE(sum(w.reserved_minor), 0) FROM public.commerce_wallet_accounts w) AS wallet_reserved_minor,
    (SELECT COALESCE(sum(r.total_minor), 0) FROM public.commerce_wallet_fee_reservations r WHERE r.status = 'reserved') AS active_fee_reservation_minor
), checks AS (
  SELECT
    (SELECT bool_and(present) FROM table_state) AS required_tables_present,
    (SELECT bool_and(present) FROM function_state) AS required_functions_present,
    (SELECT bool_and(present AND NOT anon_execute AND NOT public_execute
      AND authenticated_execute = authenticated_expected) FROM function_state) AS function_acl_matches_contract,
    (SELECT service_role_execute FROM function_state
      WHERE signature = 'public.approve_user_listing_with_fee_decision(uuid,text,text,text,text)')
      AS approval_service_role_execute,
    (SELECT bool_and(present AND security_definer = definer_expected
      AND 'search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
      FROM function_state) AS functions_hardened,
    (SELECT bool_and(present AND rls_enabled AND NOT client_can_write AND NOT public_has_grant
      AND (NOT deny_client_read OR NOT client_can_read)) FROM table_state) AS tables_hardened,
    (SELECT bool_and(present AND matches_contract) FROM trigger_state) AS triggers_match_contract,
    to_regprocedure('public.approve_user_listing(uuid)') IS NULL AS legacy_approval_removed,
    EXISTS (SELECT 1 FROM constraints WHERE contype = 'u' AND definition = 'UNIQUE (user_listing_id, approval_cycle)')
      AND EXISTS (SELECT 1 FROM constraints WHERE contype = 'u' AND definition = 'UNIQUE (owner_user_id, idempotency_key)')
      AS decision_identity_constraints_present,
    EXISTS (SELECT 1 FROM constraints WHERE contype = 'c'
      AND definition LIKE '%manual_reason%' AND definition LIKE '%fee_mode%'
      AND definition LIKE '%amount_minor%' AND definition LIKE '%terms_version%')
      AS decision_snapshot_constraint_present,
    (SELECT orphan_active_fee_reservation_count = 0 FROM data_state) AS no_orphan_active_fee_reservations,
    (SELECT orphan_active_approved_property_count = 0 FROM data_state) AS no_orphan_active_approved_properties,
    (SELECT free_decision_with_active_reservation_count = 0 FROM data_state) AS no_free_decision_reservation,
    (SELECT wallet_reserved_minor = active_fee_reservation_minor FROM data_state) AS wallet_reserved_balance_matches
)
SELECT jsonb_build_object(
  'checks', to_jsonb(checks),
  'functions', (SELECT jsonb_agg(to_jsonb(f) ORDER BY signature) FROM function_state f),
  'tables', (SELECT jsonb_agg(to_jsonb(t) ORDER BY table_name) FROM table_state t),
  'triggers', (SELECT jsonb_agg(to_jsonb(t) ORDER BY trigger_name) FROM trigger_state t),
  'data_state', (SELECT to_jsonb(d) FROM data_state d),
  'commerce_listing_approval_post_verify_pass',
    (SELECT bool_and(value = 'true'::jsonb) FROM jsonb_each(to_jsonb(checks))),
  'verified_at', now(),
  'scope', 'Metadata only; data cleanup, PostgREST cache and browser permissions require separate verification.'
) AS commerce_listing_approval_post_verify
FROM checks;

ROLLBACK;
