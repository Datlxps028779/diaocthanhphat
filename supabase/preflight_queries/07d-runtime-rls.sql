-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

SELECT now() AS measured_at, 'rls_policy' AS inventory_type,
       schemaname || '.' || tablename AS object_name,
       policyname AS item_name,
       cmd AS item_kind,
       roles::text AS validated,
       'USING=' || coalesce(qual, '') || ' WITH_CHECK=' || coalesce(with_check, '') AS definition,
       NULL::boolean, NULL::text, NULL::boolean, NULL::boolean
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'properties', 'user_listings', 'leads', 'property_verification_cases',
    'property_verification_evidence', 'property_verification_events',
    'user_listing_lifecycle_events'
  )
ORDER BY object_name, item_name;

ROLLBACK;
