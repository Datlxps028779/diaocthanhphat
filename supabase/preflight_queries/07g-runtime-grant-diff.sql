-- Read-only grant diff for the sensitive data tables.
-- This proposes least-privilege targets; it does not apply any GRANT/REVOKE.
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
), desired AS (
  SELECT
    t.schema_name,
    t.table_name,
    r.role_name,
    p.privilege_name,
    CASE
      WHEN r.role_name = 'service_role' THEN true
      WHEN r.role_name = 'anon'
       AND t.table_name = 'properties'
       AND p.privilege_name = 'SELECT' THEN true
      WHEN r.role_name = 'authenticated'
       AND t.table_name = 'leads'
       AND p.privilege_name IN ('SELECT', 'UPDATE', 'DELETE') THEN true
      WHEN r.role_name = 'authenticated'
       AND t.table_name IN ('properties', 'user_listings')
       AND p.privilege_name IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE') THEN true
      ELSE false
    END AS desired_value
  FROM target_tables t
  CROSS JOIN target_roles r
  CROSS JOIN target_privileges p
), compared AS (
  SELECT
    d.*,
    has_table_privilege(
      d.role_name,
      format('%I.%I', d.schema_name, d.table_name),
      d.privilege_name
    ) AS current_value
  FROM desired d
)
SELECT
  now() AS measured_at,
  'grant_diff' AS inventory_type,
  schema_name || '.' || table_name AS object_name,
  privilege_name AS item_name,
  'least_privilege_review' AS item_kind,
  role_name::text AS validated,
  format(
    'current=%s; desired=%s; action=%s',
    current_value,
    desired_value,
    CASE
      WHEN current_value = desired_value THEN 'keep'
      WHEN desired_value THEN 'grant_candidate'
      ELSE 'revoke_candidate'
    END
  ) AS definition,
  current_value AS bool_value,
  CASE
    WHEN current_value = desired_value THEN 'no_change'
    WHEN desired_value THEN 'grant_candidate'
    ELSE 'revoke_candidate'
  END AS text_value,
  NULL::boolean AS anon_value,
  NULL::boolean AS authenticated_value
FROM compared
ORDER BY object_name, validated, item_name;

ROLLBACK;
