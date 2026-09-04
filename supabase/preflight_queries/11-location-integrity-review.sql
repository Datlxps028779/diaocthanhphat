-- Read-only canonical location review for property and user-listing candidates.
-- Exact unique matches are candidates for review only; this does not backfill IDs or rewrite text.
BEGIN TRANSACTION READ ONLY;

WITH measured AS (
  SELECT now() AS measured_at
), source_rows AS (
  SELECT
    'properties'::text AS source,
    p.id,
    p.area_id,
    p.district_id,
    p.ward_id,
    p.city,
    p.district,
    p.ward,
    p.neighborhood_slug,
    p.latitude,
    p.longitude,
    p.is_active AS public_active,
    m.measured_at
  FROM public.properties p
  CROSS JOIN measured m

  UNION ALL

  SELECT
    'user_listings'::text,
    l.id,
    l.area_id,
    l.district_id,
    l.ward_id,
    l.city,
    l.district,
    l.ward,
    l.neighborhood_slug,
    l.latitude,
    l.longitude,
    l.status = 'approved',
    m.measured_at
  FROM public.user_listings l
  CROSS JOIN measured m
), resolved AS (
  SELECT
    s.*,
    a.name AS area_name_by_id,
    d.name AS district_name_by_id,
    w.name AS ward_name_by_id,
    dc.district_match_count,
    dc.exact_district_id,
    dc.matching_district_names,
    wc.ward_match_count,
    wc.exact_ward_id,
    wc.matching_ward_names,
    CASE
      WHEN s.area_id IS NULL THEN 'missing_area_id'
      WHEN s.district_id IS NULL AND dc.district_match_count = 1 THEN 'safe_district_backfill_candidate'
      WHEN s.district_id IS NULL AND dc.district_match_count > 1 THEN 'ambiguous_district_candidate'
      WHEN s.district_id IS NULL
       AND dc.district_match_count = 0
       AND NULLIF(btrim(s.district), '') IS NOT NULL THEN 'unmatched_district_candidate'
      WHEN s.ward_id IS NULL AND wc.ward_match_count = 1 THEN 'safe_ward_backfill_candidate'
      WHEN s.ward_id IS NULL AND wc.ward_match_count > 1 THEN 'ambiguous_ward_candidate'
      WHEN s.ward_id IS NULL
       AND wc.ward_match_count = 0
       AND NULLIF(btrim(s.ward), '') IS NOT NULL THEN 'unmatched_ward_candidate'
      WHEN s.district_id IS NOT NULL
       AND NULLIF(btrim(s.district), '') IS NOT NULL
       AND dc.exact_district_id IS DISTINCT FROM s.district_id THEN 'district_id_conflict'
      WHEN s.ward_id IS NOT NULL
       AND NULLIF(btrim(s.ward), '') IS NOT NULL
       AND wc.exact_ward_id IS DISTINCT FROM s.ward_id THEN 'ward_id_conflict'
      ELSE 'location_review_candidate'
    END AS location_class
  FROM source_rows s
  LEFT JOIN public.areas a ON a.id = s.area_id
  LEFT JOIN public.districts d ON d.id = s.district_id
  LEFT JOIN public.wards w ON w.id = s.ward_id
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS district_match_count,
      (array_agg(candidate.id ORDER BY candidate.id))[1] AS exact_district_id,
      string_agg(candidate.name, ' | ' ORDER BY candidate.name) AS matching_district_names
    FROM public.districts candidate
    WHERE candidate.area_id = s.area_id
      AND NULLIF(btrim(s.district), '') IS NOT NULL
      AND public.normalize_location_label(candidate.name) = public.normalize_location_label(s.district)
  ) dc ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS ward_match_count,
      (array_agg(candidate.id ORDER BY candidate.id))[1] AS exact_ward_id,
      string_agg(candidate.name, ' | ' ORDER BY candidate.name) AS matching_ward_names
    FROM public.wards candidate
    WHERE candidate.district_id = coalesce(s.district_id, dc.exact_district_id)
      AND NULLIF(btrim(s.ward), '') IS NOT NULL
      AND public.normalize_location_label(candidate.name) = public.normalize_location_label(s.ward)
  ) wc ON true
), candidates AS (
  SELECT *
  FROM resolved
  WHERE location_class <> 'location_review_candidate'
     OR area_id IS NULL
     OR district_id IS NULL
     OR ward_id IS NULL
     OR (district_id IS NOT NULL AND NULLIF(btrim(district), '') IS NOT NULL AND exact_district_id IS DISTINCT FROM district_id)
     OR (ward_id IS NOT NULL AND NULLIF(btrim(ward), '') IS NOT NULL AND exact_ward_id IS DISTINCT FROM ward_id)
), classified AS (
  SELECT
    c.*,
    CASE
      WHEN (c.latitude IS NULL) <> (c.longitude IS NULL) THEN 'incomplete_pair'
      WHEN c.latitude IS NULL AND c.longitude IS NULL THEN 'not_measured'
      WHEN c.ward_id IS NULL THEN 'missing_ward_id'
      WHEN NOT EXISTS (
        SELECT 1
        FROM public.taxonomy_geo geo
        WHERE geo.entity_type = 'ward'
          AND geo.entity_id = c.ward_id
          AND geo.is_published
          AND geo.administrative_vintage = 'legacy_pre_merger'
          AND geo.geojson IS NOT NULL
      ) THEN 'missing_polygon'
      WHEN NOT public.taxonomy_geo_covers_point('ward', c.ward_id, c.latitude, c.longitude) THEN 'outside_polygon'
      ELSE 'valid'
    END AS coordinate_class
  FROM candidates c
), summary_rows AS (
  SELECT
    min(measured_at) AS measured_at,
    location_class,
    count(*)::integer AS candidate_count,
    count(*) FILTER (WHERE public_active IS TRUE)::integer AS active_candidate_count,
    count(*) FILTER (WHERE coordinate_class NOT IN ('valid', 'not_measured'))::integer AS coordinate_issue_count
  FROM classified
  GROUP BY location_class
), inventory AS (
  SELECT
    measured_at,
    'location_integrity_review_summary'::text AS inventory_type,
    'public.properties + public.user_listings'::text AS object_name,
    location_class AS item_name,
    'classification_summary'::text AS item_kind,
    'location identity candidate'::text AS validated,
    jsonb_build_object(
      'location_class', location_class,
      'candidate_count', candidate_count,
      'active_candidate_count', active_candidate_count,
      'coordinate_issue_count', coordinate_issue_count
    )::text AS definition,
    (candidate_count > 0) AS bool_value,
    location_class AS text_value,
    NULL::boolean AS anon_value,
    NULL::boolean AS authenticated_value
  FROM summary_rows

  UNION ALL

  SELECT
    measured_at,
    'location_integrity_review_detail',
    source || '.' || id::text,
    id::text,
    'location_candidate'::text,
    CASE WHEN public_active THEN 'active' ELSE 'inactive' END,
    jsonb_build_object(
      'source', source,
      'id', id,
      'public_active', public_active,
      'area_id', area_id,
      'area_name_by_id', area_name_by_id,
      'district_id', district_id,
      'district_name_by_id', district_name_by_id,
      'district_text', district,
      'district_match_count', district_match_count,
      'exact_district_id', exact_district_id,
      'matching_district_names', matching_district_names,
      'ward_id', ward_id,
      'ward_name_by_id', ward_name_by_id,
      'ward_text', ward,
      'ward_match_count', ward_match_count,
      'exact_ward_id', exact_ward_id,
      'matching_ward_names', matching_ward_names,
      'city', city,
      'neighborhood_slug', neighborhood_slug,
      'latitude', latitude,
      'longitude', longitude,
      'location_class', location_class,
      'coordinate_class', coordinate_class,
      'recommendation', CASE
        WHEN location_class IN ('safe_district_backfill_candidate', 'safe_ward_backfill_candidate')
          THEN 'Review exact unique match; backfill ID only after confirming the source text.'
        ELSE 'Manual review required; do not rewrite location text or IDs automatically.'
      END
    )::text,
    true,
    location_class,
    NULL::boolean,
    NULL::boolean
  FROM classified
)
SELECT
  measured_at,
  inventory_type,
  object_name,
  item_name,
  item_kind,
  validated,
  definition,
  bool_value,
  text_value,
  anon_value,
  authenticated_value
FROM inventory
ORDER BY
  CASE inventory_type
    WHEN 'location_integrity_review_summary' THEN 1
    ELSE 2
  END,
  item_name;

ROLLBACK;
