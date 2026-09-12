-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

WITH source_rows AS (
  SELECT 'properties'::text AS source, p.id, p.area_id, p.district_id, p.ward_id,
         p.city, p.district, p.ward, p.neighborhood_slug,
         p.is_active AS public_active
  FROM public.properties p
  UNION ALL
  SELECT 'user_listings', l.id, l.area_id, l.district_id, l.ward_id,
         l.city, l.district, l.ward, l.neighborhood_slug,
         l.status = 'approved'
  FROM public.user_listings l
), district_candidates AS (
  SELECT s.source, s.id,
         count(d.id)::int AS district_match_count,
         (array_agg(d.id ORDER BY d.id) FILTER (WHERE d.id IS NOT NULL))[1] AS exact_district_id
  FROM source_rows s
  LEFT JOIN public.districts d
    ON d.area_id = s.area_id
   AND public.normalize_location_label(d.name) = public.normalize_location_label(s.district)
  GROUP BY s.source, s.id
), ward_candidates AS (
  SELECT s.source, s.id,
         count(w.id)::int AS ward_match_count,
         (array_agg(w.id ORDER BY w.id) FILTER (WHERE w.id IS NOT NULL))[1] AS exact_ward_id
  FROM source_rows s
  JOIN district_candidates dc ON dc.source = s.source AND dc.id = s.id
  LEFT JOIN public.wards w
    ON w.district_id = coalesce(s.district_id, dc.exact_district_id)
   AND public.normalize_location_label(w.name) = public.normalize_location_label(s.ward)
  GROUP BY s.source, s.id
), resolved AS (
  SELECT s.*, dc.exact_district_id, dc.district_match_count,
         wc.exact_ward_id, wc.ward_match_count
  FROM source_rows s
  JOIN district_candidates dc ON dc.source = s.source AND dc.id = s.id
  JOIN ward_candidates wc ON wc.source = s.source AND wc.id = s.id
)
SELECT now() AS measured_at, source, id,
       CASE WHEN public_active THEN 'high' ELSE 'medium' END AS severity,
       CASE
         WHEN area_id IS NULL THEN 'missing_area_id'
         WHEN district_id IS NULL AND district_match_count = 1 THEN 'safe_district_backfill_candidate'
         WHEN district_id IS NULL AND district_match_count > 1 THEN 'ambiguous_district_candidate'
         WHEN district_id IS NULL AND district_match_count = 0 AND NULLIF(btrim(district), '') IS NOT NULL THEN 'unmatched_district_candidate'
         WHEN ward_id IS NULL AND ward_match_count = 1 THEN 'safe_ward_backfill_candidate'
         WHEN ward_id IS NULL AND ward_match_count > 1 THEN 'ambiguous_ward_candidate'
         WHEN ward_id IS NULL AND ward_match_count = 0 AND NULLIF(btrim(ward), '') IS NOT NULL THEN 'unmatched_ward_candidate'
         WHEN district_id IS NOT NULL AND exact_district_id IS DISTINCT FROM district_id THEN 'district_id_conflict'
         WHEN ward_id IS NOT NULL AND exact_ward_id IS DISTINCT FROM ward_id THEN 'ward_id_conflict'
         ELSE 'location_review_candidate'
       END AS candidate_class,
       'location_identity_candidate' AS check_code,
       area_id, district_id, exact_district_id, ward_id, exact_ward_id,
       district, ward, neighborhood_slug,
       'Chỉ exact unique match mới có thể xem xét backfill; không tự rewrite text' AS notes
FROM resolved
WHERE area_id IS NULL
   OR district_id IS NULL
   OR ward_id IS NULL
   OR (district_id IS NOT NULL AND exact_district_id IS DISTINCT FROM district_id)
   OR (ward_id IS NOT NULL AND exact_ward_id IS DISTINCT FROM ward_id)
ORDER BY public_active DESC, source, id
LIMIT 500;

ROLLBACK;
