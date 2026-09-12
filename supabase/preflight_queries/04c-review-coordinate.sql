-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

WITH coordinate_rows AS (
  SELECT 'properties'::text AS source, p.id, p.ward_id, p.latitude, p.longitude, p.is_active AS public_active
  FROM public.properties p
  WHERE p.latitude IS NOT NULL OR p.longitude IS NOT NULL
  UNION ALL
  SELECT 'user_listings', l.id, l.ward_id, l.latitude, l.longitude, l.status = 'approved'
  FROM public.user_listings l
  WHERE l.latitude IS NOT NULL OR l.longitude IS NOT NULL
)
SELECT now() AS measured_at, source, id,
       CASE WHEN public_active THEN 'high' ELSE 'medium' END AS severity,
       CASE
         WHEN (latitude IS NULL) <> (longitude IS NULL) THEN 'incomplete_pair'
         WHEN ward_id IS NULL THEN 'missing_ward_id'
         WHEN NOT EXISTS (
           SELECT 1 FROM public.taxonomy_geo geo
           WHERE geo.entity_type = 'ward' AND geo.entity_id = coordinate_rows.ward_id
             AND geo.is_published AND geo.administrative_vintage = 'legacy_pre_merger' AND geo.geojson IS NOT NULL
         ) THEN 'missing_polygon'
         WHEN NOT public.taxonomy_geo_covers_point('ward', ward_id, latitude, longitude) THEN 'outside_polygon'
         ELSE 'valid'
       END AS candidate_class,
       'coordinate_taxonomy_candidate' AS check_code, ward_id, latitude, longitude,
       'Không sửa hoặc đổi ward theo tọa độ nếu chưa có evidence taxonomy exact' AS notes
FROM coordinate_rows
WHERE (latitude IS NULL) <> (longitude IS NULL)
   OR ward_id IS NULL
   OR NOT EXISTS (
     SELECT 1 FROM public.taxonomy_geo geo
     WHERE geo.entity_type = 'ward' AND geo.entity_id = coordinate_rows.ward_id
       AND geo.is_published AND geo.administrative_vintage = 'legacy_pre_merger' AND geo.geojson IS NOT NULL
   )
   OR NOT public.taxonomy_geo_covers_point('ward', ward_id, latitude, longitude)
ORDER BY public_active DESC, source, id
LIMIT 500;

ROLLBACK;
