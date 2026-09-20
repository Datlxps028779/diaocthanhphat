-- =============================================================================
-- Property write-boundary audit — production read-only measurement
--
-- Người dùng chạy trên production Supabase SQL Editor.
-- Chỉ đọc metadata quyền/trigger/function; không sửa dữ liệu hay schema.
-- Không in user email, phone, JWT hoặc service-role key.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- 1) RLS state and table-level grants for direct properties writes.
SELECT
  'properties_table_boundary' AS section,
  c.relname AS table_name,
  c.relrowsecurity AS row_level_security_enabled,
  c.relforcerowsecurity AS force_row_level_security,
  has_table_privilege('anon', 'public.properties', 'SELECT') AS anon_select,
  has_table_privilege('anon', 'public.properties', 'INSERT') AS anon_insert,
  has_table_privilege('anon', 'public.properties', 'UPDATE') AS anon_update,
  has_table_privilege('anon', 'public.properties', 'DELETE') AS anon_delete,
  has_table_privilege('authenticated', 'public.properties', 'SELECT') AS authenticated_select,
  has_table_privilege('authenticated', 'public.properties', 'INSERT') AS authenticated_insert,
  has_table_privilege('authenticated', 'public.properties', 'UPDATE') AS authenticated_update,
  has_table_privilege('authenticated', 'public.properties', 'DELETE') AS authenticated_delete,
  has_table_privilege('service_role', 'public.properties', 'SELECT') AS service_role_select,
  has_table_privilege('service_role', 'public.properties', 'INSERT') AS service_role_insert,
  has_table_privilege('service_role', 'public.properties', 'UPDATE') AS service_role_update,
  has_table_privilege('service_role', 'public.properties', 'DELETE') AS service_role_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'properties';

-- 2) Exact policies on properties, including the USING/WITH CHECK expressions.
SELECT
  'properties_rls_policy' AS section,
  polname AS policy_name,
  CASE polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
    ELSE polcmd::text
  END AS command,
  pg_get_userbyid(c.relowner) AS table_owner,
  pg_get_expr(polqual, polrelid) AS using_expression,
  pg_get_expr(polwithcheck, polrelid) AS with_check_expression
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
WHERE pol.polrelid = 'public.properties'::regclass
ORDER BY polname, command;

-- 3) Triggers that can alter/guard properties writes. The definition is returned
-- only for public functions and contains no credentials by contract.
SELECT
  'properties_trigger' AS section,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_definition,
  p.oid::regprocedure AS trigger_function,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND c.relname = 'properties'
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 4) Public functions whose deployed definition references properties writes.
-- This identifies server/RPC boundaries without exposing source table contents.
SELECT
  'property_write_function' AS section,
  p.oid::regprocedure AS function_name,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
  CASE
    WHEN pg_get_functiondef(p.oid) ~* '(\m(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+(public\.)?"?properties"?\M)'
      THEN true
    ELSE false
  END AS definition_contains_properties_write
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind IN ('f', 'p')
  AND pg_get_functiondef(p.oid) ~* '(\m(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+(public\.)?"?properties"?\M)'
ORDER BY p.proname, p.oid::regprocedure::text;

-- 5) Column-level grants. Return one row per column/privilege so this query
-- remains compatible with SQL Editor result handling and avoids aggregation.
SELECT
  'properties_column_grant' AS section,
  grantee,
  privilege_type,
  column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'properties'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type, column_name;

-- 6) The two observed examples: timestamp relation to approval and current
-- public projection fingerprints. No mutation and no contact fields.
WITH pairs(user_listing_id, property_id) AS (
  VALUES
    (
      '7dc2d044-a169-49be-970a-4d9b5c96d87e'::uuid,
      '096b4529-f7dd-4d74-ba2c-e3c9e1aa7d1e'::uuid
    ),
    (
      '8d2094b9-1291-4fa8-8d00-276008d4e78d'::uuid,
      '656c371c-0f12-456a-a485-212cd0be1d33'::uuid
    )
)
SELECT
  'observed_post_approval_edits' AS section,
  ul.id AS user_listing_id,
  p.id AS property_id,
  approval.approved_at,
  p.created_at AS property_created_at,
  p.updated_at AS property_updated_at,
  extract(epoch FROM (p.updated_at - approval.approved_at))::bigint AS seconds_after_approval,
  md5(concat_ws('|', p.title, p.meta_title, p.slug)) AS property_editorial_fingerprint,
  md5(concat_ws('|', ul.title, ul.meta_title, ul.slug)) AS submission_editorial_fingerprint
FROM pairs x
JOIN public.user_listings ul ON ul.id = x.user_listing_id
JOIN public.properties p ON p.id = x.property_id
LEFT JOIN LATERAL (
  SELECT max(e.occurred_at) AS approved_at
  FROM public.user_listing_lifecycle_events e
  WHERE e.listing_id = ul.id
    AND e.event_type = 'approved'
) approval ON true;

ROLLBACK;
