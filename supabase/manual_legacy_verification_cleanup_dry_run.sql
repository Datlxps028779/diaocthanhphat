-- Read-only dry-run for clearing orphaned legacy verification flags.
-- This must return only the exact rows eligible for cleanup.
BEGIN TRANSACTION READ ONLY;

WITH targets AS (
  SELECT
    p.id,
    p.public_code,
    p.title,
    p.is_active,
    p.is_verified,
    p.verification_status,
    p.verification_scope_codes,
    p.verified_at,
    p.verified_until
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
), inventory AS (
  SELECT
    now() AS measured_at,
    'legacy_verification_cleanup_dry_run'::text AS inventory_type,
    'public.properties'::text AS object_name,
    'target_count'::text AS item_name,
    'cleanup_summary'::text AS item_kind,
    'exact orphaned legacy predicate'::text AS validated,
    format('target_count=%s; mutation=none', count(*)) AS definition,
    count(*) > 0 AS bool_value,
    'target_count'::text AS text_value,
    NULL::boolean AS anon_value,
    NULL::boolean AS authenticated_value
  FROM targets

  UNION ALL

  SELECT
    now(),
    'legacy_verification_cleanup_dry_run',
    'public.properties',
    coalesce(public_code::text, id::text),
    'cleanup_target',
    title,
    format(
      'property_id=%s; public_code=%s; is_active=%s; is_verified=%s; verification_status=%s; scope_count=%s; verified_at=%s; verified_until=%s; case_count=0; mutation=none',
      id,
      coalesce(public_code::text, 'null'),
      is_active,
      is_verified,
      verification_status,
      cardinality(coalesce(verification_scope_codes, '{}'::text[])),
      coalesce(verified_at::text, 'null'),
      coalesce(verified_until::text, 'null')
    ),
    true,
    'eligible_target',
    NULL::boolean,
    NULL::boolean
  FROM targets
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
ORDER BY item_kind, item_name;

ROLLBACK;
