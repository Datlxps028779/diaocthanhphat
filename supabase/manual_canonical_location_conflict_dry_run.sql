-- =============================================================================
-- Horizon 1 — Location conflict correction dry-run (read-only)
--
-- Measures one proven property/listing conflict and proposes only a taxonomy
-- location sync from the valid property projection to its linked listing.
-- No mutation, DDL, ownership, content, status, expiry, or lifecycle changes.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH candidate AS (
  SELECT
    p.id AS property_id,
    l.id AS listing_id,
    l.status AS listing_status,
    l.expires_at,
    p.is_active AS property_is_active,
    p.is_verified AS property_is_verified,
    p.verification_status,
    l.updated_at AS listing_updated_at,
    p.updated_at AS property_updated_at,

    p.city AS property_city,
    p.district AS property_district,
    p.ward AS property_ward,
    p.area_id AS property_area_id,
    p.district_id AS property_district_id,
    p.ward_id AS property_ward_id,
    p.neighborhood_slug AS property_neighborhood_slug,

    l.city AS listing_city,
    l.district AS listing_district,
    l.ward AS listing_ward,
    l.area_id AS listing_area_id,
    l.district_id AS listing_district_id,
    l.ward_id AS listing_ward_id,
    l.neighborhood_slug AS listing_neighborhood_slug,

    pa.name AS property_area_name,
    pd.name AS property_taxonomy_district_name,
    pw.name AS property_taxonomy_ward_name,
    la.name AS listing_area_name,
    ld.name AS listing_taxonomy_district_name,
    lw.name AS listing_taxonomy_ward_name,

    p.area_id IS NOT NULL AND pa.id IS NOT NULL AS property_area_id_resolves,
    p.district_id IS NOT NULL AND pd.id IS NOT NULL AND pd.area_id = p.area_id AS property_district_hierarchy_valid,
    p.ward_id IS NOT NULL AND pw.id IS NOT NULL AND pw.district_id = p.district_id AS property_ward_hierarchy_valid,
    l.area_id IS NOT NULL AND la.id IS NOT NULL AS listing_area_id_resolves,
    l.district_id IS NOT NULL AND ld.id IS NOT NULL AND ld.area_id = l.area_id AS listing_district_hierarchy_valid,
    l.ward_id IS NOT NULL AND lw.id IS NOT NULL AND lw.district_id = l.district_id AS listing_ward_hierarchy_valid,
    CASE
      WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        THEN public.taxonomy_geo_covers_point('ward', p.ward_id, p.latitude, p.longitude)
      ELSE false
    END AS property_coordinate_in_property_ward,
    CASE
      WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL
        THEN public.taxonomy_geo_covers_point('ward', l.ward_id, p.latitude, p.longitude)
      ELSE false
    END AS property_coordinate_in_listing_ward
  FROM public.properties AS p
  JOIN public.user_listings AS l ON l.property_id = p.id
  LEFT JOIN public.areas AS pa ON pa.id = p.area_id
  LEFT JOIN public.districts AS pd ON pd.id = p.district_id
  LEFT JOIN public.wards AS pw ON pw.id = p.ward_id
  LEFT JOIN public.areas AS la ON la.id = l.area_id
  LEFT JOIN public.districts AS ld ON ld.id = l.district_id
  LEFT JOIN public.wards AS lw ON lw.id = l.ward_id
  WHERE p.id = 'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid
    AND l.id = '087b078e-a678-49aa-822f-ba26f038012a'::uuid
)
SELECT
  now() AS measured_at,
  'canonical_location_conflict_dry_run' AS source,
  'location_sync_from_property_to_listing' AS check_code,
  CASE WHEN property_is_verified IS TRUE OR verification_status IN ('verified', 'revoked') THEN 'high' ELSE 'medium' END AS severity,
  listing_status AS scope,
  property_id,
  listing_id,
  listing_status,
  expires_at,
  property_is_active,
  property_is_verified,
  verification_status,
  listing_updated_at,
  property_updated_at,

  listing_city AS current_listing_city,
  listing_district AS current_listing_district,
  listing_ward AS current_listing_ward,
  listing_area_id AS current_listing_area_id,
  listing_district_id AS current_listing_district_id,
  listing_ward_id AS current_listing_ward_id,
  listing_neighborhood_slug AS current_listing_neighborhood_slug,

  property_city AS proposed_listing_city,
  property_district AS proposed_listing_district,
  property_ward AS proposed_listing_ward,
  property_area_id AS proposed_listing_area_id,
  property_district_id AS proposed_listing_district_id,
  property_ward_id AS proposed_listing_ward_id,
  property_neighborhood_slug AS proposed_listing_neighborhood_slug,
  property_area_name,
  property_taxonomy_district_name,
  property_taxonomy_ward_name,
  listing_area_name,
  listing_taxonomy_district_name,
  listing_taxonomy_ward_name,

  property_area_id_resolves,
  property_district_hierarchy_valid,
  property_ward_hierarchy_valid,
  listing_area_id_resolves,
  listing_district_hierarchy_valid,
  listing_ward_hierarchy_valid,
  property_coordinate_in_property_ward,
  property_coordinate_in_listing_ward,
  (
    listing_city IS DISTINCT FROM property_city
    OR listing_district IS DISTINCT FROM property_district
    OR listing_ward IS DISTINCT FROM property_ward
    OR listing_area_id IS DISTINCT FROM property_area_id
    OR listing_district_id IS DISTINCT FROM property_district_id
    OR listing_ward_id IS DISTINCT FROM property_ward_id
    OR listing_neighborhood_slug IS DISTINCT FROM property_neighborhood_slug
  ) AS location_conflict_exists,
  (
    listing_status = 'approved'
    AND expires_at IS NOT NULL
    AND expires_at > now()
    AND property_is_active IS TRUE
    AND property_area_id_resolves
    AND property_district_hierarchy_valid
    AND property_ward_hierarchy_valid
    AND property_coordinate_in_property_ward
    AND NOT property_coordinate_in_listing_ward
    AND listing_city IS DISTINCT FROM property_city
    AND listing_area_id IS DISTINCT FROM property_area_id
  ) AS ready_for_guarded_user_run,
  'Proposed scope: update only user_listings city, district, ward, area_id, district_id, ward_id, neighborhood_slug from the linked valid property; preserve address, formatted_address, price, content, ownership, status, expiry, verification and lifecycle history.' AS notes
FROM candidate;

ROLLBACK;
