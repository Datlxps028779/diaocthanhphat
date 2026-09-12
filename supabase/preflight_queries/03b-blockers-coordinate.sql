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
), coordinate_blockers AS (
  SELECT c.*, CASE
    WHEN (c.latitude IS NULL) <> (c.longitude IS NULL) THEN 'incomplete_coordinate_pair'
    WHEN c.latitude IS NOT NULL AND (c.latitude < -90 OR c.latitude > 90 OR c.longitude < -180 OR c.longitude > 180) THEN 'coordinate_out_of_range'
    WHEN c.ward_id IS NULL THEN 'missing_ward_id'
    WHEN NOT EXISTS (
      SELECT 1 FROM public.taxonomy_geo geo
      WHERE geo.entity_type = 'ward' AND geo.entity_id = c.ward_id
        AND geo.is_published AND geo.administrative_vintage = 'legacy_pre_merger'
        AND geo.geojson IS NOT NULL
    ) THEN 'missing_published_ward_polygon'
    WHEN NOT public.taxonomy_geo_covers_point('ward', c.ward_id, c.latitude, c.longitude) THEN 'outside_ward_polygon'
  END AS check_code
  FROM coordinate_rows c
)
SELECT now() AS measured_at, source, check_code,
       CASE WHEN public_active THEN 'high' ELSE 'medium' END AS severity,
       CASE WHEN public_active THEN 'public_active' ELSE 'all' END AS scope,
       count(*)::bigint AS row_count,
       'Coordinate and exact ward polygon contradiction' AS notes
FROM coordinate_blockers
WHERE check_code IS NOT NULL
GROUP BY source, check_code, public_active
ORDER BY source, severity DESC, check_code;

ROLLBACK;
