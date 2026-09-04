-- Read-only postcheck for the orphaned legacy verification cleanup.
BEGIN TRANSACTION READ ONLY;

WITH orphaned_legacy AS (
  SELECT p.id
  FROM public.properties p
  WHERE p.is_verified IS TRUE
    AND p.verification_status = 'unverified'
    AND cardinality(coalesce(p.verification_scope_codes, '{}'::text[])) = 0
    AND p.verified_at IS NULL
    AND p.verified_until IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.property_verification_cases c
      WHERE c.property_id = p.id
    )
), remaining_verified AS (
  SELECT count(*)::integer AS property_count
  FROM public.properties
  WHERE is_verified IS TRUE
), inventory AS (
  SELECT
    now() AS measured_at,
    'legacy_verification_cleanup_postcheck'::text AS inventory_type,
    'public.properties'::text AS object_name,
    'orphaned_legacy_count'::text AS item_name,
    'cleanup_postcheck'::text AS item_kind,
    'is_verified=true with unverified status, empty scope, no dates, and no case'::text AS validated,
    format('orphaned_legacy_count=%s; expected=0; status=%s', count(*), CASE WHEN count(*) = 0 THEN 'pass' ELSE 'fail' END) AS definition,
    count(*) = 0 AS bool_value,
    CASE WHEN count(*) = 0 THEN 'pass' ELSE 'fail' END AS text_value,
    NULL::boolean AS anon_value,
    NULL::boolean AS authenticated_value
  FROM orphaned_legacy

  UNION ALL

  SELECT
    now(),
    'legacy_verification_cleanup_postcheck',
    'public.properties',
    'remaining_is_verified_true_count',
    'cleanup_postcheck',
    'informational; evidence-backed rows are not modified',
    format('remaining_is_verified_true_count=%s', property_count),
    NULL::boolean,
    'informational',
    NULL::boolean,
    NULL::boolean
  FROM remaining_verified
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
ORDER BY item_name;

ROLLBACK;
