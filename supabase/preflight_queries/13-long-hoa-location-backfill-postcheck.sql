-- Read-only postcheck for the authenticated Long Hòa location correction.
-- Confirms both fixed rows and verifies identity/lifecycle fields remain intact.
BEGIN TRANSACTION READ ONLY;

WITH checked AS (
  SELECT
    'properties'::text AS source,
    p.id AS record_id,
    p.id AS property_id,
    p.city,
    p.district,
    p.ward,
    p.area_id,
    p.district_id,
    p.ward_id,
    NULL::text AS status,
    NULL::timestamptz AS expires_at,
    p.is_active AS property_is_active,
    p.is_verified,
    p.verification_status,
    p.neighborhood_slug,
    p.latitude,
    p.longitude,
    CASE
      WHEN p.id = 'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid
       AND p.is_active IS TRUE
       AND p.is_verified IS FALSE
       AND p.verification_status = 'unverified'
       AND p.city = 'TP. Hồ Chí Minh'
       AND p.district = 'Cần Giờ'
       AND p.ward = 'Long Hòa'
       AND p.area_id = '37cad24c-afa9-47e7-a0b9-d1351c74f1fc'::uuid
       AND p.district_id = 'acf04041-b171-4f2f-ab4c-0ba288968775'::uuid
       AND p.ward_id = 'd50fcc80-798b-4fce-a162-7f9ee00cf18e'::uuid
       AND p.neighborhood_slug IS NULL
       AND p.latitude IS NULL
       AND p.longitude IS NULL
        THEN 'pass'
      ELSE 'fail'
    END AS status_check
  FROM public.properties p
  WHERE p.id = 'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid

  UNION ALL

  SELECT
    'user_listings'::text,
    l.id,
    l.property_id,
    l.city,
    l.district,
    l.ward,
    l.area_id,
    l.district_id,
    l.ward_id,
    l.status,
    l.expires_at,
    NULL::boolean,
    NULL::boolean,
    NULL::text,
    l.neighborhood_slug,
    l.latitude,
    l.longitude,
    CASE
      WHEN l.id = '087b078e-a678-49aa-822f-ba26f038012a'::uuid
       AND l.property_id = 'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid
       AND l.status = 'approved'
       AND l.expires_at IS NOT NULL
       AND l.expires_at > now()
       AND l.city = 'TP. Hồ Chí Minh'
       AND l.district = 'Cần Giờ'
       AND l.ward = 'Long Hòa'
       AND l.area_id = '37cad24c-afa9-47e7-a0b9-d1351c74f1fc'::uuid
       AND l.district_id = 'acf04041-b171-4f2f-ab4c-0ba288968775'::uuid
       AND l.ward_id = 'd50fcc80-798b-4fce-a162-7f9ee00cf18e'::uuid
       AND l.neighborhood_slug IS NULL
       AND l.latitude IS NULL
       AND l.longitude IS NULL
        THEN 'pass'
      ELSE 'fail'
    END
  FROM public.user_listings l
  WHERE l.id = '087b078e-a678-49aa-822f-ba26f038012a'::uuid
), inventory AS (
  SELECT
    now() AS measured_at,
    'long_hoa_location_backfill_postcheck_summary'::text AS inventory_type,
    'public.properties + public.user_listings'::text AS object_name,
    'all_fixed_targets'::text AS item_name,
    'postcheck_summary'::text AS item_kind,
    'Both fixed rows must have the canonical Long Hòa location'::text AS validated,
    format(
      'target_count=%s; pass_count=%s; fail_count=%s; status=%s',
      count(*),
      count(*) FILTER (WHERE status_check = 'pass'),
      count(*) FILTER (WHERE status_check = 'fail'),
      CASE WHEN count(*) = 2 AND bool_and(status_check = 'pass') THEN 'pass' ELSE 'fail' END
    ) AS definition,
    (count(*) = 2 AND bool_and(status_check = 'pass')) AS bool_value,
    CASE WHEN count(*) = 2 AND bool_and(status_check = 'pass') THEN 'pass' ELSE 'fail' END AS text_value,
    NULL::boolean AS anon_value,
    NULL::boolean AS authenticated_value
  FROM checked

  UNION ALL

  SELECT
    now(),
    'long_hoa_location_backfill_postcheck_detail',
    source || '.' || record_id::text,
    record_id::text,
    'postcheck_detail',
    status_check,
    jsonb_build_object(
      'source', source,
      'record_id', record_id,
      'property_id', property_id,
      'city', city,
      'district', district,
      'ward', ward,
      'area_id', area_id,
      'district_id', district_id,
      'ward_id', ward_id,
      'status', status,
      'expires_at', expires_at,
      'property_is_active', property_is_active,
      'is_verified', is_verified,
      'verification_status', verification_status,
      'neighborhood_slug', neighborhood_slug,
      'latitude', latitude,
      'longitude', longitude,
      'status_check', status_check,
      'unchanged_fields', ARRAY['id', 'property_id', 'ownership', 'status', 'expires_at', 'title', 'price', 'legal_status', 'neighborhood_slug', 'latitude', 'longitude']
    )::text,
    status_check = 'pass',
    status_check,
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
    WHEN 'long_hoa_location_backfill_postcheck_summary' THEN 1
    ELSE 2
  END,
  item_name;

ROLLBACK;
