-- Commerce listing lifecycle enforcement post-migration verification. READ ONLY.

WITH lifecycle_functions(name, signature) AS (
  VALUES
    ('commerce_owner_has_quota_history', 'public.commerce_owner_has_quota_history(uuid)'),
    ('commerce_reserve_listing_quota_cycle_internal', 'public.commerce_reserve_listing_quota_cycle_internal(uuid,uuid,uuid,integer,text,timestamp with time zone)'),
    ('commerce_reserve_listing_quota_cycle', 'public.commerce_reserve_listing_quota_cycle(uuid,uuid)'),
    ('commerce_consume_listing_quota_cycle', 'public.commerce_consume_listing_quota_cycle(uuid,uuid)'),
    ('commerce_close_listing_quota_cycle', 'public.commerce_close_listing_quota_cycle(uuid,uuid,text)'),
    ('sync_commerce_listing_entitlement_lifecycle', 'public.sync_commerce_listing_entitlement_lifecycle()')
), function_state AS (
  SELECT
    expected.name,
    expected.signature,
    p.oid,
    p.prosecdef,
    p.proconfig,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM lifecycle_functions expected
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(expected.signature)
), trigger_state AS (
  SELECT
    t.tgname,
    t.tgenabled,
    t.tgtype,
    p.proname,
    c.relname
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE n.nspname = 'public'
    AND c.relname = 'user_listings'
    AND t.tgname IN (
      'trg_commerce_listing_entitlement_lifecycle',
      'trg_commerce_listing_entitlement_delete'
    )
    AND NOT t.tgisinternal
), index_state AS (
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'commerce_quota_reservations'
    AND indexname IN (
      'uq_commerce_quota_listing_cycle',
      'uq_commerce_quota_listing_reserved'
    )
), view_state AS (
  SELECT
    c.relname,
    c.reloptions,
    has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
    has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'commerce_effective_entitlements'
    AND c.relkind = 'v'
), public_reserve_acl AS (
  SELECT
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    p.prosecdef,
    p.proconfig
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.commerce_reserve_listing_quota(uuid,uuid,integer,text,timestamp with time zone)')
), results AS (
  SELECT
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'commerce_quota_reservations'
        AND column_name = 'submission_cycle'
        AND is_nullable = 'NO'
        AND column_default = '1'
    ) AS submission_cycle_present,
    (SELECT count(*) FROM index_state) = 2
      AND NOT EXISTS (SELECT 1 FROM index_state WHERE indexdef NOT ILIKE '%UNIQUE%')
      AS reservation_cycle_indexes_present,
    (SELECT count(*) FROM function_state WHERE oid IS NOT NULL) = 6
      AND NOT EXISTS (
        SELECT 1 FROM function_state
        WHERE oid IS NULL
           OR NOT prosecdef
           OR NOT ('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
           OR anon_execute
           OR authenticated_execute
      ) AS lifecycle_functions_hardened,
    EXISTS (
      SELECT 1 FROM trigger_state
      WHERE tgname = 'trg_commerce_listing_entitlement_lifecycle'
        AND tgenabled = 'O'
        AND tgtype = 21
        AND proname = 'sync_commerce_listing_entitlement_lifecycle'
    ) AND EXISTS (
      SELECT 1 FROM trigger_state
      WHERE tgname = 'trg_commerce_listing_entitlement_delete'
        AND tgenabled = 'O'
        AND tgtype = 11
        AND proname = 'sync_commerce_listing_entitlement_lifecycle'
    ) AS lifecycle_triggers_present,
    (SELECT count(*) FROM view_state) = 1
      AND EXISTS (
        SELECT 1 FROM view_state
        WHERE 'security_invoker=true' = ANY(COALESCE(reloptions, ARRAY[]::text[]))
          AND NOT anon_select
          AND authenticated_select
      ) AS effective_view_hardened,
    EXISTS (
      SELECT 1 FROM public_reserve_acl
      WHERE NOT anon_execute
        AND authenticated_execute
        AND prosecdef
        AND 'search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[]))
    ) AS explicit_reserve_acl_valid,
    NOT EXISTS (
      SELECT 1
      FROM public.commerce_quota_reservations
      WHERE status = 'reserved' AND user_listing_id IS NOT NULL
      GROUP BY user_listing_id
      HAVING count(*) > 1
    ) AS no_duplicate_active_reservations
)
SELECT *,
  submission_cycle_present
  AND reservation_cycle_indexes_present
  AND lifecycle_functions_hardened
  AND lifecycle_triggers_present
  AND effective_view_hardened
  AND explicit_reserve_acl_valid
  AND no_duplicate_active_reservations
  AS commerce_listing_lifecycle_verify_pass
FROM results;
