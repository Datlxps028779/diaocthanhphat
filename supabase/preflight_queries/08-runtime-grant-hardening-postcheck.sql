-- Read-only postcheck for the least-privilege table-role migration.
-- Run after applying the migration; this does not mutate data or privileges.
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
), expected AS (
  SELECT
    t.schema_name,
    t.table_name,
    r.role_name,
    p.privilege_name,
    CASE
      WHEN r.role_name = 'service_role' THEN true
      WHEN r.role_name IN ('anon', 'authenticated')
       AND t.table_name = 'properties'
       AND p.privilege_name = 'SELECT' THEN true
      WHEN r.role_name = 'authenticated'
       AND t.table_name = 'leads'
       AND p.privilege_name IN ('SELECT', 'UPDATE', 'DELETE') THEN true
      WHEN r.role_name = 'authenticated'
       AND t.table_name IN ('properties', 'user_listings')
       AND p.privilege_name IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE') THEN true
      ELSE false
    END AS expected_value
  FROM target_tables t
  CROSS JOIN target_roles r
  CROSS JOIN target_privileges p
), table_checks AS (
  SELECT
    e.schema_name,
    e.table_name,
    e.role_name,
    e.privilege_name,
    e.expected_value,
    has_table_privilege(
      e.role_name,
      format('%I.%I', e.schema_name, e.table_name),
      e.privilege_name
    ) AS current_value
  FROM expected e
), inventory AS (
  SELECT
    now() AS measured_at,
    'grant_postcheck'::text AS inventory_type,
    schema_name || '.' || table_name AS object_name,
    privilege_name AS item_name,
    'has_table_privilege'::text AS item_kind,
    role_name::text AS validated,
    format(
      'current=%s; expected=%s; status=%s',
      current_value,
      expected_value,
      CASE WHEN current_value = expected_value THEN 'pass' ELSE 'fail' END
    ) AS definition,
    (current_value = expected_value) AS bool_value,
    CASE WHEN current_value = expected_value THEN 'pass' ELSE 'fail' END AS text_value,
    NULL::boolean AS anon_value,
    NULL::boolean AS authenticated_value
  FROM table_checks

  UNION ALL

  SELECT
    now(),
    'rls_postcheck',
    n.nspname || '.' || c.relname,
    'rls_enabled',
    'table_security',
    NULL,
    format(
      'relrowsecurity=%s; relforcerowsecurity=%s; status=%s',
      c.relrowsecurity,
      c.relforcerowsecurity,
      CASE WHEN c.relrowsecurity THEN 'pass' ELSE 'fail' END
    ),
    c.relrowsecurity,
    CASE WHEN c.relforcerowsecurity THEN 'force_enabled' ELSE 'force_disabled' END,
    NULL,
    NULL
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN target_tables t ON t.schema_name = n.nspname AND t.table_name = c.relname

  UNION ALL

  SELECT
    now(),
    'role_postcheck',
    'pg_roles',
    r.rolname::text,
    'role_security',
    r.rolname::text,
    format(
      'rolcanlogin=%s; rolbypassrls=%s; status=%s',
      r.rolcanlogin,
      r.rolbypassrls,
      CASE
        WHEN r.rolname = 'service_role' AND r.rolbypassrls THEN 'pass'
        WHEN r.rolname IN ('anon', 'authenticated') AND NOT r.rolbypassrls THEN 'pass'
        ELSE 'fail'
      END
    ),
    CASE
      WHEN r.rolname = 'service_role' THEN r.rolbypassrls
      ELSE NOT r.rolbypassrls
    END,
    CASE WHEN r.rolcanlogin THEN 'login_enabled' ELSE 'login_disabled' END,
    NULL,
    NULL
  FROM pg_roles r
  JOIN target_roles tr ON tr.role_name = r.rolname

  UNION ALL

  SELECT
    now(),
    'rpc_postcheck',
    n.nspname || '.' || p.proname,
    'security_definer',
    'function_security',
    NULL,
    format(
      'prosecdef=%s; status=%s',
      p.prosecdef,
      CASE WHEN p.prosecdef THEN 'pass' ELSE 'fail' END
    ),
    p.prosecdef,
    NULL,
    NULL,
    NULL
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      p.oid = 'public.public_submit_lead(uuid, text, text, text, text, uuid, text, text, timestamptz)'::regprocedure
      OR p.oid = 'public.public_reveal_property_phone(uuid, text, text, text)'::regprocedure
    )

  UNION ALL

  SELECT
    now(),
    'rpc_postcheck',
    'public.' || rpc.rpc_name,
    role_name || '_execute',
    'function_privilege',
    role_name,
    format(
      'has_function_privilege=%s; expected=true; status=%s',
      has_function_privilege(role_name, rpc.signature, 'EXECUTE'),
      CASE WHEN has_function_privilege(role_name, rpc.signature, 'EXECUTE') THEN 'pass' ELSE 'fail' END
    ),
    has_function_privilege(role_name, rpc.signature, 'EXECUTE'),
    NULL,
    NULL,
    NULL
  FROM (
    VALUES
      ('public_submit_lead', 'public.public_submit_lead(uuid, text, text, text, text, uuid, text, text, timestamptz)'::text),
      ('public_reveal_property_phone', 'public.public_reveal_property_phone(uuid, text, text, text)'::text)
  ) AS rpc(rpc_name, signature)
  CROSS JOIN (VALUES ('anon'::name), ('authenticated'::name)) AS roles(role_name)
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
