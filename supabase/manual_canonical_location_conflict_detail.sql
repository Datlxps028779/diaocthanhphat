-- =============================================================================
-- Horizon 1 — Location conflict detail for one measured pair (read-only)
--
-- Confirms which property/listing location values match the published taxonomy.
-- This query never chooses a winner and never mutates data.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

SELECT
  now() AS measured_at,
  'canonical_field_measurement' AS source,
  p.id AS property_id,
  l.id AS listing_id,
  l.status AS listing_status,
  p.is_active AS property_is_active,
  p.is_verified AS property_is_verified,
  p.verification_status,
  p.created_at AS property_created_at,
  p.updated_at AS property_updated_at,
  l.created_at AS listing_created_at,
  l.updated_at AS listing_updated_at,

  p.title AS property_title,
  p.description AS property_description,
  p.address AS property_address,
  p.formatted_address AS property_formatted_address,
  p.latitude AS property_latitude,
  p.longitude AS property_longitude,

  l.title AS listing_title,
  l.description AS listing_description,
  l.address AS listing_address,
  l.formatted_address AS listing_formatted_address,
  l.latitude AS listing_latitude,
  l.longitude AS listing_longitude,

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
  pn.name AS property_neighborhood_name,
  la.name AS listing_area_name,
  ld.name AS listing_taxonomy_district_name,
  lw.name AS listing_taxonomy_ward_name,
  ln.name AS listing_neighborhood_name,

  (p.area_id IS NOT NULL AND pa.id IS NOT NULL) AS property_area_id_resolves,
  (p.district_id IS NOT NULL AND pd.id IS NOT NULL AND pd.area_id = p.area_id) AS property_district_hierarchy_valid,
  (p.ward_id IS NOT NULL AND pw.id IS NOT NULL AND pw.district_id = p.district_id) AS property_ward_hierarchy_valid,
  (l.area_id IS NOT NULL AND la.id IS NOT NULL) AS listing_area_id_resolves,
  (l.district_id IS NOT NULL AND ld.id IS NOT NULL AND ld.area_id = l.area_id) AS listing_district_hierarchy_valid,
  (l.ward_id IS NOT NULL AND lw.id IS NOT NULL AND lw.district_id = l.district_id) AS listing_ward_hierarchy_valid,
  (p.area_id IS DISTINCT FROM l.area_id
    OR p.district_id IS DISTINCT FROM l.district_id
    OR p.ward_id IS DISTINCT FROM l.ward_id) AS structured_ids_conflict,
  (lower(NULLIF(btrim(p.city), '')) IS DISTINCT FROM lower(NULLIF(btrim(l.city), ''))
    OR lower(NULLIF(btrim(p.district), '')) IS DISTINCT FROM lower(NULLIF(btrim(l.district), ''))
    OR lower(NULLIF(btrim(p.ward), '')) IS DISTINCT FROM lower(NULLIF(btrim(l.ward), ''))) AS text_location_conflict,
  (NULLIF(btrim(p.address), '') IS DISTINCT FROM NULLIF(btrim(l.address), '')) AS address_conflict,
  (NULLIF(btrim(p.formatted_address), '') IS DISTINCT FROM NULLIF(btrim(l.formatted_address), '')) AS formatted_address_conflict,
  (p.latitude IS DISTINCT FROM l.latitude OR p.longitude IS DISTINCT FROM l.longitude) AS coordinate_conflict,
  (p.latitude IS NOT NULL AND p.longitude IS NOT NULL) AS property_has_coordinates,
  (l.latitude IS NOT NULL AND l.longitude IS NOT NULL) AS listing_has_coordinates,
  CASE
    WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL
      THEN public.taxonomy_geo_covers_point('ward', p.ward_id, p.latitude, p.longitude)
    ELSE false
  END AS property_coordinate_in_property_ward,
  CASE
    WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL
      THEN public.taxonomy_geo_covers_point('ward', l.ward_id, p.latitude, p.longitude)
    ELSE false
  END AS property_coordinate_in_listing_ward,
  'Read-only evidence only. Do not update property/listing location until taxonomy and source evidence are reviewed.' AS notes
FROM public.properties AS p
JOIN public.user_listings AS l
  ON l.property_id = p.id
LEFT JOIN public.areas AS pa ON pa.id = p.area_id
LEFT JOIN public.districts AS pd ON pd.id = p.district_id
LEFT JOIN public.wards AS pw ON pw.id = p.ward_id
LEFT JOIN public.neighborhoods AS pn ON pn.slug = p.neighborhood_slug
LEFT JOIN public.areas AS la ON la.id = l.area_id
LEFT JOIN public.districts AS ld ON ld.id = l.district_id
LEFT JOIN public.wards AS lw ON lw.id = l.ward_id
LEFT JOIN public.neighborhoods AS ln ON ln.slug = l.neighborhood_slug
WHERE p.id = 'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid
  AND l.id = '087b078e-a678-49aa-822f-ba26f038012a'::uuid;

ROLLBACK;
