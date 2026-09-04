-- Read-only resolution check for location rows with a ward label but no district/ward IDs.
-- A unique ward match inside the area is review evidence only; this does not backfill IDs.
BEGIN TRANSACTION READ ONLY;

WITH source_rows AS (
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
    p.is_active AS public_active
  FROM public.properties p

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
    l.status = 'approved'
  FROM public.user_listings l
), candidates AS (
  SELECT *
  FROM source_rows
  WHERE area_id IS NOT NULL
    AND ward_id IS NULL
    AND NULLIF(btrim(ward), '') IS NOT NULL
    AND (
      district_id IS NULL
      OR NULLIF(btrim(district), '') IS NULL
    )
), matched AS (
  SELECT
    c.*,
    a.name AS area_name,
    count(w.id)::integer AS ward_match_count_in_area,
    jsonb_agg(
      jsonb_build_object(
        'ward_id', w.id,
        'ward_name', w.name,
        'district_id', d.id,
        'district_name', d.name,
        'ward_slug', w.slug
      ) ORDER BY d.name, w.name
    ) FILTER (WHERE w.id IS NOT NULL) AS matching_wards,
    (array_agg(w.id ORDER BY d.name, w.name) FILTER (WHERE w.id IS NOT NULL))[1] AS exact_ward_id,
    (array_agg(d.id ORDER BY d.name, w.name) FILTER (WHERE w.id IS NOT NULL))[1] AS exact_district_id,
    count(DISTINCT w.district_id)::integer AS matched_district_count
  FROM candidates c
  LEFT JOIN public.areas a ON a.id = c.area_id
  LEFT JOIN public.districts d ON d.area_id = c.area_id
  LEFT JOIN public.wards w
    ON w.district_id = d.id
   AND public.normalize_location_label(w.name) = public.normalize_location_label(c.ward)
  GROUP BY c.source, c.id, c.area_id, c.district_id, c.ward_id,
           c.city, c.district, c.ward, c.neighborhood_slug,
           c.latitude, c.longitude, c.public_active, a.name
), classified AS (
  SELECT
    m.*,
    CASE
      WHEN m.ward_match_count_in_area = 1 AND m.matched_district_count = 1
        THEN 'safe_area_ward_backfill_candidate'
      WHEN m.ward_match_count_in_area > 1
        THEN 'ambiguous_ward_across_area'
      ELSE 'unmatched_ward_in_area'
    END AS resolution_class
  FROM matched m
), inventory AS (
  SELECT
    now() AS measured_at,
    'location_unmatched_resolution_summary'::text AS inventory_type,
    'public.properties + public.user_listings'::text AS object_name,
    resolution_class AS item_name,
    'classification_summary'::text AS item_kind,
    'ward label matched against every canonical ward in the same area'::text AS validated,
    format(
      'resolution_class=%s; candidate_count=%s; active_candidate_count=%s',
      resolution_class,
      count(*),
      count(*) FILTER (WHERE public_active IS TRUE)
    ) AS definition,
    (count(*) > 0) AS bool_value,
    resolution_class AS text_value,
    NULL::boolean AS anon_value,
    NULL::boolean AS authenticated_value
  FROM classified
  GROUP BY resolution_class

  UNION ALL

  SELECT
    now(),
    'location_unmatched_resolution_detail',
    source || '.' || id::text,
    id::text,
    'location_candidate',
    CASE WHEN public_active THEN 'active' ELSE 'inactive' END,
    jsonb_build_object(
      'source', source,
      'id', id,
      'public_active', public_active,
      'area_id', area_id,
      'area_name', area_name,
      'district_id', district_id,
      'district_text', district,
      'ward_id', ward_id,
      'ward_text', ward,
      'exact_district_id', exact_district_id,
      'exact_ward_id', exact_ward_id,
      'ward_match_count_in_area', ward_match_count_in_area,
      'matched_district_count', matched_district_count,
      'matching_wards', coalesce(matching_wards, '[]'::jsonb),
      'neighborhood_slug', neighborhood_slug,
      'latitude', latitude,
      'longitude', longitude,
      'resolution_class', resolution_class,
      'recommendation', CASE
        WHEN resolution_class = 'safe_area_ward_backfill_candidate'
          THEN 'Review the unique area-scoped ward match; if confirmed, backfill district_id and ward_id only.'
        ELSE 'Do not infer district_id or ward_id from the label; manual source review is required.'
      END
    )::text,
    true,
    resolution_class,
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
    WHEN 'location_unmatched_resolution_summary' THEN 1
    ELSE 2
  END,
  item_name;

ROLLBACK;
