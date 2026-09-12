-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

SELECT now() AS measured_at, 'function' AS inventory_type,
       n.nspname || '.' || p.proname AS object_name,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS item_name,
       'function' AS item_kind,
       NULL::text AS validated,
       NULL::text AS definition,
       p.prosecdef AS security_definer,
       coalesce(array_to_string(p.proconfig, ','), '') AS configuration,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'normalize_location_label', 'normalize_listing_title', 'taxonomy_geo_covers_point',
    'validate_listing_location_integrity', 'guard_pending_user_listing_quality',
    'approve_user_listing', 'capture_user_listing_lifecycle_event',
    'public_reveal_property_phone', 'public_submit_lead'
  )
ORDER BY object_name, item_name;

ROLLBACK;
