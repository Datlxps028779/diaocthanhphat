-- =============================================================================
-- Horizon 1 — Read-only postcheck after confirmed location correction
--
-- The one-time admin correction has already run and passed production postcheck.
-- This file is retained only to repeat the read-only integrity check.
-- Do not run an UPDATE from the SQL Editor.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

SELECT
  now() AS checked_at,
  l.id AS listing_id,
  l.property_id,
  l.status,
  l.expires_at,
  l.city,
  l.district,
  l.ward,
  l.area_id,
  l.district_id,
  l.ward_id,
  l.neighborhood_slug,
  p.city AS property_city,
  p.district AS property_district,
  p.ward AS property_ward,
  p.area_id AS property_area_id,
  p.district_id AS property_district_id,
  p.ward_id AS property_ward_id,
  l.city IS NOT DISTINCT FROM p.city
    AND l.district IS NOT DISTINCT FROM p.district
    AND l.ward IS NOT DISTINCT FROM p.ward
    AND l.area_id IS NOT DISTINCT FROM p.area_id
    AND l.district_id IS NOT DISTINCT FROM p.district_id
    AND l.ward_id IS NOT DISTINCT FROM p.ward_id AS location_matches_property,
  l.status = 'approved' AS remains_approved,
  l.expires_at > now() AS remains_unexpired,
  l.property_id = 'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid AS identity_preserved
FROM public.user_listings AS l
JOIN public.properties AS p ON p.id = l.property_id
WHERE l.id = '087b078e-a678-49aa-822f-ba26f038012a'::uuid
  AND p.id = 'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid;

ROLLBACK;
