-- =============================================================================
-- P7 verification: production read-only dry run
-- =============================================================================
-- READ ONLY. Run this BEFORE applying 20260904000000_property_verification_cases.sql.
-- It measures legacy boolean distribution without inferring evidence, reviewers,
-- scope, or dates. Do not use its result to bulk-create verification records.

BEGIN TRANSACTION READ ONLY;

-- 1) Legacy flag distribution: this is compatibility/audit data, not evidence.
SELECT
  count(*) AS total_properties,
  count(*) FILTER (WHERE is_active) AS active_properties,
  count(*) FILTER (WHERE is_verified) AS legacy_verified_properties,
  count(*) FILTER (WHERE is_active AND is_verified) AS active_legacy_verified_properties,
  count(*) FILTER (WHERE NOT is_active AND is_verified) AS inactive_legacy_verified_properties
FROM public.properties;

-- 2) Distribution across business dimensions. Useful to estimate manual review
-- workload only; it must never generate a backfill decision.
SELECT
  coalesce(listing_type, '(trống)') AS listing_type,
  coalesce(city, '(trống)') AS city,
  count(*) AS total,
  count(*) FILTER (WHERE is_active) AS active,
  count(*) FILTER (WHERE is_verified) AS legacy_verified,
  count(*) FILTER (WHERE is_active AND is_verified) AS active_legacy_verified
FROM public.properties
GROUP BY 1, 2
ORDER BY active_legacy_verified DESC, total DESC, listing_type, city;

-- 3) Relationship coverage for candidate manual review. A linked approved listing
-- is only a routing hint; it is not evidence and does not imply eligibility.
SELECT
  count(*) FILTER (WHERE p.is_active AND p.is_verified) AS active_legacy_verified,
  count(*) FILTER (WHERE p.is_active AND p.is_verified AND ul.id IS NOT NULL) AS with_linked_user_listing,
  count(*) FILTER (WHERE p.is_active AND p.is_verified AND ul.id IS NULL) AS without_linked_user_listing,
  count(*) FILTER (WHERE p.is_active AND p.is_verified AND ul.status = 'approved') AS with_approved_linked_listing
FROM public.properties p
LEFT JOIN public.user_listings ul ON ul.approved_property_id = p.id;

-- 4) Existing source fields are incomplete administrative data only. This exposes
-- what a future human review can inspect, not documentary proof.
SELECT
  count(*) FILTER (WHERE p.is_active AND p.is_verified) AS active_legacy_verified,
  count(*) FILTER (WHERE p.is_active AND p.is_verified AND nullif(btrim(p.contact_phone), '') IS NOT NULL) AS has_contact_phone,
  count(*) FILTER (WHERE p.is_active AND p.is_verified AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL) AS has_coordinates,
  count(*) FILTER (WHERE p.is_active AND p.is_verified AND (nullif(btrim(p.image_url), '') IS NOT NULL OR coalesce(cardinality(p.images), 0) > 0)) AS has_media_reference,
  count(*) FILTER (WHERE p.is_active AND p.is_verified AND nullif(btrim(p.legal_status), '') IS NOT NULL) AS has_legal_status_text
FROM public.properties p;

-- 5) Check required authorization functions and current legacy column definition.
SELECT n.nspname AS schema_name, p.proname AS function_name, pg_get_function_result(p.oid) AS returns
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_owner_mfa', 'is_admin', 'is_admin_or_staff')
ORDER BY p.proname;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'properties'
  AND column_name IN ('is_verified', 'is_active', 'updated_at')
ORDER BY column_name;

ROLLBACK;
