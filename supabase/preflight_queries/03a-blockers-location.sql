-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

-- candidate IDs are emitted separately.
WITH source_rows AS (
  SELECT 'properties'::text AS source, p.id, p.area_id, p.district_id, p.ward_id,
         p.city, p.district, p.ward, p.neighborhood_slug, p.latitude, p.longitude,
         p.is_active AS public_active
  FROM public.properties p
  UNION ALL
  SELECT 'user_listings', l.id, l.area_id, l.district_id, l.ward_id,
         l.city, l.district, l.ward, l.neighborhood_slug, l.latitude, l.longitude,
         l.status = 'approved'
  FROM public.user_listings l
), district_candidates AS (
  SELECT s.source, s.id, count(d.id)::int AS district_match_count,
         (array_agg(d.id ORDER BY d.id) FILTER (WHERE d.id IS NOT NULL))[1] AS exact_district_id
  FROM source_rows s
  LEFT JOIN public.districts d
    ON d.area_id = s.area_id
   AND public.normalize_location_label(d.name) = public.normalize_location_label(s.district)
  GROUP BY s.source, s.id
), district_resolution AS (
  SELECT s.*, dc.district_match_count, dc.exact_district_id,
         selected.id AS selected_district_id,
         selected.area_id AS selected_district_area_id,
         selected.name AS selected_district_name
  FROM source_rows s
  JOIN district_candidates dc ON dc.source = s.source AND dc.id = s.id
  LEFT JOIN public.districts selected ON selected.id = s.district_id
), location_blockers AS (
  SELECT source, id, public_active,
    CASE
      WHEN district_id IS NOT NULL AND selected_district_id IS NULL THEN 'missing_selected_district'
      WHEN district_id IS NOT NULL AND area_id IS NOT NULL AND selected_district_area_id <> area_id THEN 'district_area_mismatch'
      WHEN district_id IS NOT NULL AND public.normalize_location_label(district) IS NOT NULL
       AND public.normalize_location_label(district) <> public.normalize_location_label(selected_district_name) THEN 'district_label_mismatch'
      WHEN district_id IS NULL AND area_id IS NOT NULL AND public.normalize_location_label(district) IS NOT NULL AND district_match_count = 0 THEN 'district_not_found'
      WHEN district_id IS NULL AND area_id IS NOT NULL AND public.normalize_location_label(district) IS NOT NULL AND district_match_count > 1 THEN 'district_ambiguous'
      WHEN ward_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.wards w WHERE w.id = source_rows.ward_id) THEN 'missing_selected_ward'
      WHEN ward_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.wards w WHERE w.id = source_rows.ward_id AND w.district_id IS DISTINCT FROM COALESCE(source_rows.district_id, source_rows.exact_district_id)) THEN 'ward_district_mismatch'
      WHEN district_id IS NOT NULL AND public.normalize_location_label(ward) IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.wards w WHERE public.normalize_location_label(w.name) = public.normalize_location_label(source_rows.ward))
       AND NOT EXISTS (SELECT 1 FROM public.wards w WHERE w.district_id = COALESCE(source_rows.district_id, source_rows.exact_district_id) AND public.normalize_location_label(w.name) = public.normalize_location_label(source_rows.ward)) THEN 'ward_text_district_mismatch'
      WHEN neighborhood_slug IS NOT NULL AND btrim(neighborhood_slug) <> ''
       AND NOT EXISTS (SELECT 1 FROM public.neighborhoods n WHERE n.slug = source_rows.neighborhood_slug) THEN 'missing_neighborhood'
      WHEN neighborhood_slug IS NOT NULL AND btrim(neighborhood_slug) <> '' AND EXISTS (
        SELECT 1
        FROM public.neighborhoods n
        LEFT JOIN public.wards nw ON nw.id = n.ward_id
        WHERE n.slug = source_rows.neighborhood_slug
          AND (
            (source_rows.area_id IS NOT NULL AND coalesce(n.area_id, (SELECT d.area_id FROM public.districts d WHERE d.id = coalesce(n.district_id, nw.district_id))) IS DISTINCT FROM source_rows.area_id)
            OR (coalesce(source_rows.district_id, source_rows.exact_district_id) IS NOT NULL AND coalesce(n.district_id, nw.district_id) IS DISTINCT FROM coalesce(source_rows.district_id, source_rows.exact_district_id))
            OR (source_rows.ward_id IS NOT NULL AND n.ward_id IS NOT NULL AND n.ward_id IS DISTINCT FROM source_rows.ward_id)
          )
      ) THEN 'neighborhood_hierarchy_mismatch'
    END AS check_code
  FROM district_resolution source_rows
)
SELECT now() AS measured_at, source, check_code,
       CASE WHEN public_active THEN 'high' ELSE 'medium' END AS severity,
       CASE WHEN public_active THEN 'public_active' ELSE 'all' END AS scope,
       count(*)::bigint AS row_count,
       'Location FK/text/hierarchy contradiction' AS notes
FROM location_blockers
WHERE check_code IS NOT NULL
GROUP BY source, check_code, public_active
ORDER BY source, severity DESC, check_code;

ROLLBACK;
