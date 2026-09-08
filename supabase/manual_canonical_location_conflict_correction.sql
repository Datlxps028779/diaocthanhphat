-- =============================================================================
-- Horizon 1 — Confirmed location conflict correction
--
-- The direct UPDATE formerly in this file must not be run from the SQL Editor:
-- the listing mutation guard requires auth.uid(), which is absent there.
--
-- 1. Run the migration below from the SQL Editor to install the fixed-scope RPC:
--    supabase/migrations/20260930060000_admin_correct_confirmed_location_conflict.sql
-- 2. With an authenticated admin session open in the app, send POST to:
--    /api/admin/canonical-location-correction
--    The route accepts no body and the RPC accepts no arguments.
-- 3. Run the read-only postcheck below from the SQL Editor.
--
-- The RPC changes only user_listings city, district, ward, area_id,
-- district_id, and ward_id for the measured pair.
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
