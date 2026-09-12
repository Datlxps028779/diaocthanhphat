-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

SELECT now() AS measured_at, 'table_privilege' AS inventory_type,
       n.nspname || '.' || c.relname AS object_name,
       privilege_type AS item_name,
       'table_privilege' AS item_kind,
       grantee AS validated,
       NULL::text AS definition,
       NULL::boolean, NULL::text,
       NULL::boolean, NULL::boolean
FROM information_schema.role_table_grants g
JOIN pg_class c ON c.relname = g.table_name
JOIN pg_namespace n ON n.nspname = g.table_schema AND n.oid = c.relnamespace
WHERE g.table_schema = 'public'
  AND g.table_name IN ('properties', 'user_listings', 'leads', 'property_verification_cases', 'user_listing_lifecycle_events')
  AND g.grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY object_name, validated, item_name;

ROLLBACK;
