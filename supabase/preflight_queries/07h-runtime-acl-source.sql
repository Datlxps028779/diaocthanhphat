-- Read-only ACL source inventory for sensitive data tables.
-- This identifies explicit table ACL entries; it does not apply GRANT/REVOKE.
BEGIN TRANSACTION READ ONLY;

WITH target_tables(schema_name, table_name) AS (
  VALUES
    ('public'::name, 'leads'::name),
    ('public'::name, 'properties'::name),
    ('public'::name, 'user_listings'::name)
), target_roles(role_name) AS (
  VALUES ('PUBLIC'::name), ('anon'::name), ('authenticated'::name), ('service_role'::name)
), acl_entries AS (
  SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    c.relowner,
    x.grantee,
    x.grantor,
    x.privilege_type,
    x.is_grantable
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(
    COALESCE(c.relacl, acldefault('r'::"char", c.relowner))
  ) AS x
  JOIN target_tables t
    ON t.schema_name = n.nspname
   AND t.table_name = c.relname
  WHERE c.relkind IN ('r', 'p')
), normalized AS (
  SELECT
    a.schema_name,
    a.table_name,
    CASE WHEN a.grantee = 0 THEN 'PUBLIC'::name ELSE pg_get_userbyid(a.grantee)::name END AS grantee_name,
    pg_get_userbyid(a.grantor)::name AS grantor_name,
    a.privilege_type,
    a.is_grantable,
    CASE WHEN a.grantee = 0 THEN 'public_acl' ELSE 'role_acl' END AS grant_source
  FROM acl_entries a
)
SELECT
  now() AS measured_at,
  'table_acl_source' AS inventory_type,
  schema_name || '.' || table_name AS object_name,
  privilege_type AS item_name,
  'explicit_or_default_acl' AS item_kind,
  grantee_name::text AS validated,
  format(
    'grantor=%s; grantee=%s; privilege=%s; grantable=%s; source=%s',
    grantor_name,
    grantee_name,
    privilege_type,
    is_grantable,
    grant_source
  ) AS definition,
  is_grantable AS bool_value,
  grant_source AS text_value,
  NULL::boolean AS anon_value,
  NULL::boolean AS authenticated_value
FROM normalized
WHERE grantee_name IN (SELECT role_name FROM target_roles)
ORDER BY object_name, grantee_name, item_name;

ROLLBACK;
