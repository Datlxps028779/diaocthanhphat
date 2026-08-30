-- Read-only validation after polygon seed + foundation migration.
-- Review every returned ID before running the separate repair SQL.

WITH coordinate_rows AS (
  SELECT 'user_listings'::text AS source, listing.id, listing.status::text AS state,
         listing.ward_id, listing.ward, listing.latitude, listing.longitude
  FROM public.user_listings listing
  WHERE listing.latitude IS NOT NULL OR listing.longitude IS NOT NULL
  UNION ALL
  SELECT 'properties', property.id,
         CASE WHEN property.is_active THEN 'active' ELSE 'inactive' END,
         property.ward_id, property.ward, property.latitude, property.longitude
  FROM public.properties property
  WHERE property.latitude IS NOT NULL OR property.longitude IS NOT NULL
), classified AS (
  SELECT row.*,
         CASE
           WHEN row.latitude IS NULL OR row.longitude IS NULL THEN 'incomplete_pair'
           WHEN row.ward_id IS NULL THEN 'missing_ward_id'
           WHEN NOT EXISTS (
             SELECT 1 FROM public.taxonomy_geo geo
             WHERE geo.entity_type = 'ward'
               AND geo.entity_id = row.ward_id
               AND geo.is_published
               AND geo.administrative_vintage = 'legacy_pre_merger'
               AND geo.geojson IS NOT NULL
           ) THEN 'missing_polygon'
           WHEN NOT public.taxonomy_geo_covers_point('ward', row.ward_id, row.latitude, row.longitude) THEN 'outside_polygon'
           ELSE 'valid'
         END AS coordinate_status
  FROM coordinate_rows row
)
SELECT source, state, coordinate_status, count(*) AS rows
FROM classified
GROUP BY source, state, coordinate_status
ORDER BY source, state, coordinate_status;

WITH coordinate_rows AS (
  SELECT 'user_listings'::text AS source, listing.id, listing.status::text AS state,
         listing.area_id, listing.district_id, listing.ward_id, listing.ward,
         listing.latitude, listing.longitude
  FROM public.user_listings listing
  WHERE listing.latitude IS NOT NULL OR listing.longitude IS NOT NULL
  UNION ALL
  SELECT 'properties', property.id,
         CASE WHEN property.is_active THEN 'active' ELSE 'inactive' END,
         property.area_id, property.district_id, property.ward_id, property.ward,
         property.latitude, property.longitude
  FROM public.properties property
  WHERE property.latitude IS NOT NULL OR property.longitude IS NOT NULL
)
SELECT row.*,
       CASE
         WHEN row.latitude IS NULL OR row.longitude IS NULL THEN 'incomplete_pair'
         WHEN row.ward_id IS NULL THEN 'missing_ward_id'
         WHEN NOT EXISTS (
           SELECT 1 FROM public.taxonomy_geo geo
           WHERE geo.entity_type = 'ward' AND geo.entity_id = row.ward_id
             AND geo.is_published AND geo.administrative_vintage = 'legacy_pre_merger'
             AND geo.geojson IS NOT NULL
         ) THEN 'missing_polygon'
         WHEN NOT public.taxonomy_geo_covers_point('ward', row.ward_id, row.latitude, row.longitude) THEN 'outside_polygon'
         ELSE 'valid'
       END AS coordinate_status
FROM coordinate_rows row
WHERE row.latitude IS NULL OR row.longitude IS NULL OR row.ward_id IS NULL
   OR NOT public.taxonomy_geo_covers_point('ward', row.ward_id, row.latitude, row.longitude)
ORDER BY source, state, id;
