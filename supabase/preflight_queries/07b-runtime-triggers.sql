-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

SELECT now() AS measured_at, 'trigger' AS inventory_type,
       c.oid::regclass::text AS object_name, t.tgname AS item_name,
       'trigger' AS item_kind, t.tgenabled::text AS validated,
       pg_get_triggerdef(t.oid) AS definition,
       NULL::boolean, NULL::text, NULL::boolean, NULL::boolean
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('properties', 'user_listings', 'wards', 'districts')
  AND NOT t.tgisinternal
ORDER BY object_name, item_name;

ROLLBACK;
