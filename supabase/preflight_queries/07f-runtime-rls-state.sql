-- Read-only security follow-up for the three sensitive data tables.
-- This returns one result set containing catalog/RLS state and effective role
-- privileges; it is not an impersonated PostgREST access test.
BEGIN TRANSACTION READ ONLY;

WITH target_tables(schema_name, table_name) AS (
  VALUES
    ('public'::name, 'leads'::name),
    ('public'::name, 'properties'::name),
    ('public'::name, 'user_listings'::name)
), target_roles(role_name) AS (
  VALUES ('anon'::name), ('authenticated'::name), ('service_role'::name)
), target_privileges(privilege_name) AS (
  VALUES
    ('SELECT'::text),
    ('INSERT'::text),
    ('UPDATE'::text),
    ('DELETE'::text),
    ('TRUNCATE'::text),
    ('TRIGGER'::text),
    ('REFERENCES'::text),
    ('MAINTAIN'::text)
), policy_counts AS (
  SELECT
    p.schemaname,
    p.tablename,
    count(*)::bigint AS policy_count,
    count(*) FILTER (WHERE p.cmd = 'SELECT')::bigint AS select_policy_count,
    count(*) FILTER (WHERE p.cmd = 'INSERT')::bigint AS insert_policy_count,
    count(*) FILTER (WHERE p.cmd = 'UPDATE')::bigint AS update_policy_count,
    count(*) FILTER (WHERE p.cmd = 'DELETE')::bigint AS delete_policy_count,
    count(*) FILTER (WHERE p.cmd = 'ALL')::bigint AS all_policy_count
  FROM pg_policies p
  JOIN target_tables t
    ON t.schema_name::text = p.schemaname
   AND t.table_name::text = p.tablename
  GROUP BY p.schemaname, p.tablename
), inventory AS (
  SELECT
    now() AS measured_at,
    'rls_state'::text AS inventory_type,
    t.schema_name || '.' || t.table_name AS object_name,
    'rls_enabled'::text AS item_name,
    'table_security'::text AS item_kind,
    NULL::text AS validated,
    format('relrowsecurity=%s; relforcerowsecurity=%s', c.relrowsecurity, c.relforcerowsecurity) AS definition,
    c.relrowsecurity AS bool_value,
    CASE WHEN c.relforcerowsecurity THEN 'force_enabled' ELSE 'force_disabled' END AS text_value,
    NULL::boolean AS anon_value,
    NULL::boolean AS authenticated_value
  FROM target_tables t
  JOIN pg_class c
    ON c.oid = format('%I.%I', t.schema_name, t.table_name)::regclass

  UNION ALL

  SELECT
    now(),
    'role_security',
    'pg_roles',
    r.rolname::text,
    'role_security',
    r.rolname::text,
    format('rolcanlogin=%s; rolbypassrls=%s', r.rolcanlogin, r.rolbypassrls),
    r.rolbypassrls,
    CASE WHEN r.rolcanlogin THEN 'login_enabled' ELSE 'login_disabled' END,
    NULL::boolean,
    NULL::boolean
  FROM target_roles tr
  JOIN pg_roles r ON r.rolname = tr.role_name

  UNION ALL

  SELECT
    now(),
    'rls_policy_summary',
    t.schema_name || '.' || t.table_name,
    'policy_counts',
    'policy_inventory',
    NULL::text,
    format(
      'total=%s; select=%s; insert=%s; update=%s; delete=%s; all=%s',
      coalesce(pc.policy_count, 0),
      coalesce(pc.select_policy_count, 0),
      coalesce(pc.insert_policy_count, 0),
      coalesce(pc.update_policy_count, 0),
      coalesce(pc.delete_policy_count, 0),
      coalesce(pc.all_policy_count, 0)
    ),
    NULL::boolean,
    NULL::text,
    NULL::boolean,
    NULL::boolean
  FROM target_tables t
  LEFT JOIN policy_counts pc
    ON pc.schemaname = t.schema_name::text
   AND pc.tablename = t.table_name::text

  UNION ALL

  SELECT
    now(),
    'effective_table_privilege',
    t.schema_name || '.' || t.table_name,
    p.privilege_name,
    'has_table_privilege',
    r.role_name::text,
    format('has_table_privilege(%L, %L, %L)', r.role_name, t.schema_name || '.' || t.table_name, p.privilege_name),
    has_table_privilege(r.role_name, format('%I.%I', t.schema_name, t.table_name), p.privilege_name),
    NULL::text,
    NULL::boolean,
    NULL::boolean
  FROM target_tables t
  CROSS JOIN target_roles r
  CROSS JOIN target_privileges p
)
SELECT
  measured_at,
  inventory_type,
  object_name,
  item_name,
  item_kind,
  validated,
  definition,
  bool_value,
  text_value,
  anon_value,
  authenticated_value
FROM inventory
ORDER BY inventory_type, object_name, validated NULLS FIRST, item_name;

ROLLBACK;
