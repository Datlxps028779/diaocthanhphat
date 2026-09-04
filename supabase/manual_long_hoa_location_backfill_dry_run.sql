-- Read-only dry-run for the two exact-unique Long Hòa location candidates.
-- No IDs, text, identity, lifecycle, ownership, content, or coordinates are changed.
BEGIN TRANSACTION READ ONLY;

WITH expected AS (
  SELECT
    'properties'::text AS source,
    'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid AS id,
    'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid AS expected_property_id,
    '37cad24c-afa9-47e7-a0b9-d1351c74f1fc'::uuid AS expected_area_id,
    'acf04041-b171-4f2f-ab4c-0ba288968775'::uuid AS expected_district_id,
    'd50fcc80-798b-4fce-a162-7f9ee00cf18e'::uuid AS expected_ward_id,
    'TP. Hồ Chí Minh'::text AS expected_city,
    'Cần Giờ'::text AS expected_district,
    'Long Hòa'::text AS expected_ward
  UNION ALL
  SELECT
    'user_listings',
    '087b078e-a678-49aa-822f-ba26f038012a'::uuid,
    'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid,
    '37cad24c-afa9-47e7-a0b9-d1351c74f1fc'::uuid,
    'acf04041-b171-4f2f-ab4c-0ba288968775'::uuid,
    'd50fcc80-798b-4fce-a162-7f9ee00cf18e'::uuid,
    'TP. Hồ Chí Minh',
    'Cần Giờ',
    'Long Hòa'
), source_rows AS (
  SELECT
    e.*,
    NULL::uuid AS property_id,
    p.city AS current_city,
    p.district AS current_district,
    p.ward AS current_ward,
    p.area_id AS current_area_id,
    p.district_id AS current_district_id,
    p.ward_id AS current_ward_id,
    p.is_active AS property_is_active,
    NULL::text AS listing_status,
    NULL::timestamptz AS expires_at
  FROM expected e
  JOIN public.properties p ON e.source = 'properties' AND p.id = e.id

  UNION ALL

  SELECT
    e.*,
    l.property_id,
    l.city,
    l.district,
    l.ward,
    l.area_id,
    l.district_id,
    l.ward_id,
    NULL::boolean,
    l.status,
    l.expires_at
  FROM expected e
  JOIN public.user_listings l ON e.source = 'user_listings' AND l.id = e.id
), checked AS (
  SELECT
    s.*,
    a.name AS canonical_area_name,
    d.name AS canonical_district_name,
    w.name AS canonical_ward_name,
    CASE
      WHEN s.source = 'properties'
       AND s.property_is_active IS TRUE
       AND s.current_area_id = s.expected_area_id
       AND s.current_district_id IS NULL
       AND s.current_ward_id IS NULL
       AND s.current_city = s.expected_city
       AND s.current_district IS NULL
       AND s.current_ward = s.expected_ward
       AND a.id = s.expected_area_id
       AND d.id = s.expected_district_id
       AND d.area_id = s.expected_area_id
       AND w.id = s.expected_ward_id
       AND w.district_id = s.expected_district_id
       THEN 'eligible_property_location_backfill'
      WHEN s.source = 'user_listings'
       AND s.property_id = s.expected_property_id
       AND s.listing_status = 'approved'
       AND (s.expires_at IS NULL OR s.expires_at > now())
       AND s.current_area_id = s.expected_area_id
       AND s.current_district_id IS NULL
       AND s.current_ward_id IS NULL
       AND s.current_city = s.expected_city
       AND s.current_district IS NULL
       AND s.current_ward = s.expected_ward
       AND a.id = s.expected_area_id
       AND d.id = s.expected_district_id
       AND d.area_id = s.expected_area_id
       AND w.id = s.expected_ward_id
       AND w.district_id = s.expected_district_id
       THEN 'eligible_listing_location_backfill'
      ELSE 'blocked_snapshot_changed_or_canonical_missing'
    END AS dry_run_class
  FROM source_rows s
  LEFT JOIN public.areas a ON a.id = s.expected_area_id
  LEFT JOIN public.districts d ON d.id = s.expected_district_id
  LEFT JOIN public.wards w ON w.id = s.expected_ward_id
), inventory AS (
  SELECT
    now() AS measured_at,
    'long_hoa_location_backfill_dry_run_summary'::text AS inventory_type,
    'public.properties + public.user_listings'::text AS object_name,
    'all_fixed_targets'::text AS item_name,
    'dry_run_summary'::text AS item_kind,
    'Only the two fixed IDs and canonical taxonomy tuple are in scope'::text AS validated,
    format(
      'target_count=%s; eligible_count=%s; blocked_count=%s; status=%s',
      count(*),
      count(*) FILTER (WHERE dry_run_class LIKE 'eligible_%'),
      count(*) FILTER (WHERE dry_run_class = 'blocked_snapshot_changed_or_canonical_missing'),
      CASE
        WHEN count(*) = 2 AND bool_and(dry_run_class LIKE 'eligible_%') THEN 'pass'
        ELSE 'fail'
      END
    ) AS definition,
    (count(*) = 2 AND bool_and(dry_run_class LIKE 'eligible_%')) AS bool_value,
    CASE
      WHEN count(*) = 2 AND bool_and(dry_run_class LIKE 'eligible_%') THEN 'pass'
      ELSE 'fail'
    END AS text_value,
    NULL::boolean AS anon_value,
    NULL::boolean AS authenticated_value
  FROM checked

  UNION ALL

  SELECT
    now(),
    'long_hoa_location_backfill_dry_run_detail',
    source || '.' || id::text,
    id::text,
    'dry_run_detail',
    CASE WHEN dry_run_class LIKE 'eligible_%' THEN 'eligible' ELSE 'blocked' END,
    jsonb_build_object(
      'source', source,
      'id', id,
      'property_id', property_id,
      'identity_mapping_matches', source = 'properties' OR property_id = expected_property_id,
      'property_is_active', property_is_active,
      'listing_status', listing_status,
      'expires_at', expires_at,
      'current_city', current_city,
      'current_district', current_district,
      'current_ward', current_ward,
      'current_area_id', current_area_id,
      'current_district_id', current_district_id,
      'current_ward_id', current_ward_id,
      'canonical_area_name', canonical_area_name,
      'canonical_district_name', canonical_district_name,
      'canonical_ward_name', canonical_ward_name,
      'expected_area_id', expected_area_id,
      'expected_district_id', expected_district_id,
      'expected_ward_id', expected_ward_id,
      'proposed_district', expected_district,
      'proposed_ward', expected_ward,
      'dry_run_class', dry_run_class,
      'unchanged_fields', ARRAY['id', 'property_id', 'ownership', 'status', 'expires_at', 'title', 'price', 'legal_status', 'neighborhood_slug', 'latitude', 'longitude']
    )::text,
    dry_run_class LIKE 'eligible_%',
    dry_run_class,
    NULL::boolean,
    NULL::boolean
  FROM checked
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
    WHEN 'long_hoa_location_backfill_dry_run_summary' THEN 1
    ELSE 2
  END,
  item_name;

ROLLBACK;
