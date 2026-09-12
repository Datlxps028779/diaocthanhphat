-- =============================================================================
-- Horizon 1 — Data Correctness Preflight
--
-- READ ONLY. This file is an evidence snapshot, not a repair or migration.
-- Run it against a reviewed environment first, then production only when the
-- operator explicitly chooses to do so. It never creates objects or mutates rows.
--
-- Result-set contract:
--   1) preflight_summary
--   2) preflight_distributions
--   3) preflight_blockers
--   4) preflight_review_candidates
--   5) preflight_identity_candidates
--   6) preflight_schema_security
--   7) preflight_runtime_inventory
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- 1) preflight_summary
-- One row per source/check. `scope` distinguishes all rows from public inventory.
WITH listing_rows AS (
  SELECT
    'properties'::text AS source,
    p.id,
    NULLIF(btrim(p.title), '') AS title,
    p.description,
    p.price,
    p.price_unit,
    p.price_per_month,
    p.price_label,
    p.loan_support,
    p.listing_type::text,
    p.area_sqm,
    p.bedrooms::numeric AS bedrooms,
    p.bathrooms::numeric AS bathrooms,
    p.floor_count::numeric AS floor_count,
    p.road_width,
    p.frontage,
    p.image_url,
    p.images,
    p.city,
    p.district,
    p.ward,
    p.area_id,
    p.district_id,
    p.ward_id,
    p.neighborhood_slug,
    p.latitude,
    p.longitude,
    p.address,
    NULL::uuid AS property_id,
    NULL::text AS lifecycle_status,
    p.is_active AS public_active,
    NULL::timestamptz AS expires_at,
    p.slug,
    p.schema_markup,
    p.property_type_id,
    p.updated_at
  FROM public.properties p
  UNION ALL
  SELECT
    'user_listings'::text,
    l.id,
    NULLIF(btrim(l.title), ''),
    l.description,
    l.price,
    l.price_unit,
    l.price_per_month,
    l.price_label,
    l.loan_support,
    l.listing_type::text,
    l.area_sqm,
    l.bedrooms::numeric,
    l.bathrooms::numeric,
    NULL::numeric,
    NULL::numeric,
    NULL::numeric,
    l.image_url,
    l.images,
    l.city,
    l.district,
    l.ward,
    l.area_id,
    l.district_id,
    l.ward_id,
    l.neighborhood_slug,
    l.latitude,
    l.longitude,
    l.address,
    l.property_id,
    l.status,
    (l.status = 'approved'),
    l.expires_at,
    l.slug,
    l.schema_markup,
    l.property_type_id,
    l.updated_at
  FROM public.user_listings l
), checks AS (
  SELECT r.*,
    c.check_code,
    c.severity,
    c.scope,
    c.is_violation,
    c.notes
  FROM listing_rows r
  CROSS JOIN LATERAL (VALUES
    ('empty_title', 'high', 'all', r.title IS NULL, 'Title rỗng hoặc chỉ có khoảng trắng'),
    ('title_over_120', 'medium', 'all', r.title IS NOT NULL AND char_length(r.title) > 120, 'Title vượt giới hạn boundary 120 ký tự'),
    ('non_positive_area', 'medium', 'all', r.area_sqm IS NOT NULL AND r.area_sqm <= 0, 'area_sqm phải dương khi có giá trị'),
    ('invalid_bedrooms', 'medium', 'all', r.bedrooms IS NOT NULL AND (r.bedrooms < 0 OR r.bedrooms <> trunc(r.bedrooms)), 'Số phòng ngủ âm hoặc không nguyên'),
    ('invalid_bathrooms', 'medium', 'all', r.bathrooms IS NOT NULL AND (r.bathrooms < 0 OR r.bathrooms <> trunc(r.bathrooms)), 'Số phòng tắm âm hoặc không nguyên'),
    ('invalid_floor_count', 'medium', 'all', r.floor_count IS NOT NULL AND r.floor_count < 0, 'Số tầng âm'),
    ('incomplete_coordinates', 'high', 'all', (r.latitude IS NULL) <> (r.longitude IS NULL), 'Latitude/longitude không đi theo cặp'),
    ('out_of_range_coordinates', 'high', 'all', r.latitude IS NOT NULL AND (r.latitude < -90 OR r.latitude > 90 OR r.longitude < -180 OR r.longitude > 180), 'Tọa độ ngoài miền hợp lệ'),
    ('invalid_sale_price', 'high', 'all', r.listing_type = 'mua_ban' AND (r.price IS NULL OR r.price <= 0), 'Tin mua bán thiếu hoặc có giá không dương'),
    ('invalid_rental_price', 'high', 'all', r.listing_type = 'cho_thue' AND (COALESCE(r.price_per_month, r.price) IS NULL OR COALESCE(r.price_per_month, r.price) <= 0), 'Tin cho thuê thiếu hoặc có giá hiệu lực không dương'),
    ('rental_missing_monthly_field', 'medium', 'all', r.listing_type = 'cho_thue' AND r.price_per_month IS NULL, 'Tin cho thuê đang dùng fallback price thay vì price_per_month'),
    ('rental_unit_not_monthly', 'medium', 'all', r.listing_type = 'cho_thue' AND NULLIF(btrim(r.price_unit), '') IS NOT NULL AND lower(r.price_unit) NOT LIKE '%tháng%', 'Đơn vị thuê không thể hiện tháng; cần review semantics'),
    ('sale_monthly_unit', 'high', 'all', r.listing_type = 'mua_ban' AND lower(coalesce(r.price_unit, '')) LIKE '%tháng%', 'Tin mua bán có đơn vị theo tháng'),
    ('rental_loan_support', 'high', 'all', r.listing_type = 'cho_thue' AND r.loan_support IS NOT NULL, 'Tin cho thuê có khoản vay'),
    ('invalid_sale_loan_support', 'high', 'all', r.listing_type = 'mua_ban' AND r.loan_support IS NOT NULL AND (r.loan_support <= 0 OR r.price IS NULL OR r.loan_support >= r.price), 'Khoản vay bán không nằm trong khoảng 0 < loan_support < price'),
    ('missing_image', 'high', 'all', r.image_url IS NULL AND coalesce(cardinality(r.images), 0) = 0, 'Không có image_url và images'),
    ('short_description', 'medium', 'all', length(btrim(regexp_replace(regexp_replace(coalesce(r.description, ''), '<[^>]*>', ' ', 'g'), '&(nbsp|amp|lt|gt|quot|#39);', ' ', 'gi'))) < 80, 'Mô tả plain text ngắn hơn 80 ký tự'),
    ('missing_city', 'high', 'all', NULLIF(btrim(r.city), '') IS NULL, 'Thiếu city/tỉnh thành'),
    ('missing_address_and_coordinates', 'high', 'all', NULLIF(btrim(r.address), '') IS NULL AND ((r.latitude IS NULL) OR (r.longitude IS NULL)), 'Thiếu cả address và cặp tọa độ hoàn chỉnh'),
    ('price_monthly_disagreement', 'medium', 'all', r.listing_type = 'cho_thue' AND r.price_per_month IS NOT NULL AND r.price IS NOT NULL AND r.price > 0 AND r.price_per_month > 0 AND r.price_per_month <> r.price, 'price và price_per_month khác nhau; không tự chọn giá để sửa'),
    ('public_row_quality_issue', 'high', 'public_active', r.public_active AND (
      r.title IS NULL OR r.area_sqm IS NOT NULL AND r.area_sqm <= 0
      OR r.listing_type = 'mua_ban' AND (r.price IS NULL OR r.price <= 0)
      OR r.listing_type = 'cho_thue' AND COALESCE(r.price_per_month, r.price) <= 0
      OR r.image_url IS NULL AND coalesce(cardinality(r.images), 0) = 0
    ), 'Dòng đang hiển thị công khai có lỗi dữ liệu nền')
  ) AS c(check_code, severity, scope, is_violation, notes)
)
SELECT
  now() AS measured_at,
  source,
  check_code,
  severity,
  scope,
  count(*) FILTER (WHERE is_violation)::bigint AS row_count,
  max(notes) AS notes
FROM checks
GROUP BY source, check_code, severity, scope
ORDER BY source, severity DESC, check_code, scope;

-- 2) preflight_distributions
-- Distributions are intentionally not reduced to pass/fail counts.
WITH listing_rows AS (
  SELECT 'properties'::text AS source, p.id, p.listing_type::text AS listing_type,
         p.price_unit, p.price, p.price_per_month, p.price_label, p.loan_support,
         p.area_sqm, p.property_type_id, p.is_active AS public_active,
         NULL::text AS lifecycle_status
  FROM public.properties p
  UNION ALL
  SELECT 'user_listings', l.id, l.listing_type::text, l.price_unit, l.price,
         l.price_per_month, l.price_label, l.loan_support, l.area_sqm,
         l.property_type_id, l.status = 'approved', l.status
  FROM public.user_listings l
)
SELECT now() AS measured_at, source, 'listing_type_price_shape' AS distribution_code,
       coalesce(listing_type, '(null)') AS dimension_1,
       coalesce(price_unit, '(null)') AS dimension_2,
       CASE WHEN price IS NULL THEN 'price:null' ELSE 'price:set' END || '|' ||
       CASE WHEN price_per_month IS NULL THEN 'monthly:null' ELSE 'monthly:set' END || '|' ||
       CASE WHEN loan_support IS NULL THEN 'loan:null' ELSE 'loan:set' END AS dimension_3,
       lifecycle_status AS dimension_4,
       count(*)::bigint AS row_count,
       count(*) FILTER (WHERE public_active)::bigint AS public_row_count
FROM listing_rows
GROUP BY source, listing_type, price_unit, price IS NULL, price_per_month IS NULL,
         loan_support IS NULL, lifecycle_status
ORDER BY source, row_count DESC, dimension_1, dimension_2, dimension_3;

WITH listing_rows AS (
  SELECT 'properties'::text AS source, p.id, p.listing_type::text AS listing_type,
         p.price, p.price_per_month, p.price_label, p.area_sqm,
         p.property_type_id, p.is_active AS public_active
  FROM public.properties p
  UNION ALL
  SELECT 'user_listings', l.id, l.listing_type::text, l.price, l.price_per_month,
         l.price_label, l.area_sqm, l.property_type_id, l.status = 'approved'
  FROM public.user_listings l
)
SELECT now() AS measured_at, source, 'property_type_numeric_shape' AS distribution_code,
       coalesce(property_type_id::text, '(null)') AS dimension_1,
       coalesce(listing_type, '(null)') AS dimension_2,
       CASE WHEN area_sqm IS NULL THEN 'area:null' ELSE 'area:set' END AS dimension_3,
       CASE WHEN price_label ~ '[0-9]' THEN 'price_label:digits' ELSE 'price_label:no_digits_or_null' END AS dimension_4,
       count(*)::bigint AS row_count,
       count(*) FILTER (WHERE public_active)::bigint AS public_row_count
FROM listing_rows
GROUP BY source, property_type_id, listing_type, area_sqm IS NULL, price_label ~ '[0-9]'
ORDER BY source, row_count DESC, dimension_1, dimension_2;

-- 3) preflight_blockers
-- Cross-domain blockers and legacy violations; candidate IDs are emitted separately.
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

WITH lifecycle AS (
  SELECT l.id AS listing_id, l.status, l.property_id, l.expires_at,
         p.id IS NOT NULL AS property_exists, coalesce(p.is_active, false) AS property_active
  FROM public.user_listings l
  LEFT JOIN public.properties p ON p.id = l.property_id
)
SELECT now() AS measured_at, 'user_listings' AS source,
       check_code, severity, scope, count(*)::bigint AS row_count, notes
FROM lifecycle
CROSS JOIN LATERAL (VALUES
  ('approved_without_property', 'high', CASE WHEN status = 'approved' THEN 'public_active' ELSE 'all' END,
   status = 'approved' AND (property_id IS NULL OR NOT property_exists), 'Approved listing thiếu property identity'),
  ('approved_without_active_property', 'high', 'public_active',
   status = 'approved' AND NOT property_active, 'Approved listing không có property đang active'),
  ('non_approved_with_active_property', 'medium', 'all',
   status <> 'approved' AND property_active, 'Listing chưa approved nhưng property vẫn active'),
  ('approved_expired', 'high', 'public_active',
   status = 'approved' AND expires_at IS NOT NULL AND expires_at <= now(), 'Approved listing đã quá hạn nhưng còn trạng thái approved'),
  ('approved_missing_expiry', 'medium', 'public_active',
   status = 'approved' AND expires_at IS NULL, 'Approved listing không có expires_at để kiểm soát vòng đời')
) AS checks(check_code, severity, scope, is_violation, notes)
WHERE is_violation
GROUP BY check_code, severity, scope, notes
ORDER BY severity DESC, check_code;

WITH latest_event AS (
  SELECT DISTINCT ON (listing_id) listing_id, event_type, to_status, occurred_at
  FROM public.user_listing_lifecycle_events
  WHERE listing_id IS NOT NULL
  ORDER BY listing_id, occurred_at DESC, id DESC
)
SELECT now() AS measured_at, 'user_listing_lifecycle_events' AS source,
       'latest_event_status_mismatch' AS check_code, 'high' AS severity, 'all' AS scope,
       count(*)::bigint AS row_count,
       'Latest lifecycle event disagrees with current user_listing.status' AS notes
FROM public.user_listings l
JOIN latest_event e ON e.listing_id = l.id
WHERE e.to_status IS NOT NULL AND e.to_status IS DISTINCT FROM l.status;

-- 4) preflight_review_candidates
WITH title_candidates AS (
  SELECT 'properties'::text AS source, p.id, p.is_active AS public_active,
         p.title AS current_value,
         NULL::text AS proposed_value,
         p.slug,
         CASE
           WHEN p.title IS NULL OR btrim(p.title) = '' THEN 'empty_title'
           WHEN char_length(p.title) > 120 THEN 'title_over_120'
           WHEN p.title <> btrim(regexp_replace(p.title, '\s+', ' ', 'g')) THEN 'title_whitespace'
           WHEN p.title ~ '[[:alpha:]]' AND p.title = upper(p.title) AND p.title <> lower(p.title) THEN 'title_all_uppercase'
           ELSE 'title_manual_review'
         END AS candidate_class
  FROM public.properties p
  UNION ALL
  SELECT 'user_listings', l.id, l.status = 'approved', l.title, NULL::text, l.slug,
         CASE
           WHEN l.title IS NULL OR btrim(l.title) = '' THEN 'empty_title'
           WHEN char_length(l.title) > 120 THEN 'title_over_120'
           WHEN l.title <> btrim(regexp_replace(l.title, '\s+', ' ', 'g')) THEN 'title_whitespace'
           WHEN l.title ~ '[[:alpha:]]' AND l.title = upper(l.title) AND l.title <> lower(l.title) THEN 'title_all_uppercase'
           ELSE 'title_manual_review'
         END
  FROM public.user_listings l
)
SELECT now() AS measured_at, source, id,
       CASE WHEN public_active THEN 'high' ELSE 'medium' END AS severity,
       'manual_review_title_quality' AS candidate_class,
       'title_review_candidate' AS check_code,
       current_value, proposed_value, slug,
       'Chưa gọi normalize_listing_title để tránh phụ thuộc migration chưa có trên production; đối chiếu function inventory trước khi backfill' AS notes
FROM title_candidates
WHERE candidate_class <> 'title_manual_review'
ORDER BY public_active DESC, source, id
LIMIT 500;

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

-- 5) preflight_identity_candidates
WITH property_fingerprints AS (
  SELECT p.id AS property_id,
    md5(concat_ws('|',
      lower(regexp_replace(btrim(coalesce(p.title, '')), '\s+', ' ', 'g')),
      coalesce(p.description, ''), coalesce(p.price::text, ''), coalesce(p.price_unit, ''),
      coalesce(p.price_label, ''), coalesce(p.price_per_month::text, ''), coalesce(p.loan_support::text, ''),
      coalesce(p.listing_type::text, ''), coalesce(p.area_sqm::text, ''), coalesce(p.address, ''),
      coalesce(p.city, ''), coalesce(p.district, ''), coalesce(p.ward, ''), coalesce(p.image_url, ''),
      coalesce(p.contact_name, ''), coalesce(p.contact_phone, '')
    )) AS fingerprint
  FROM public.properties p
  WHERE p.is_active = true
    AND NOT EXISTS (SELECT 1 FROM public.user_listings l WHERE l.property_id = p.id)
), listing_fingerprints AS (
  SELECT l.id AS listing_id, l.user_id,
    md5(concat_ws('|',
      lower(regexp_replace(btrim(coalesce(l.title, '')), '\s+', ' ', 'g')),
      coalesce(l.description, ''), coalesce(l.price::text, ''), coalesce(l.price_unit, ''),
      coalesce(l.price_label, ''), coalesce(l.price_per_month::text, ''), coalesce(l.loan_support::text, ''),
      coalesce(l.listing_type::text, ''), coalesce(l.area_sqm::text, ''), coalesce(l.address, ''),
      coalesce(l.city, ''), coalesce(l.district, ''), coalesce(l.ward, ''), coalesce(l.image_url, ''),
      coalesce(l.contact_name, ''), coalesce(l.contact_phone, '')
    )) AS fingerprint
  FROM public.user_listings l
  WHERE l.status = 'approved' AND l.property_id IS NULL
), candidate_pairs AS (
  SELECT p.property_id, l.listing_id, l.user_id, p.fingerprint,
         count(*) OVER (PARTITION BY p.property_id) AS property_candidate_count,
         count(*) OVER (PARTITION BY l.listing_id) AS listing_candidate_count
  FROM property_fingerprints p
  JOIN listing_fingerprints l USING (fingerprint)
)
SELECT now() AS measured_at, 'property_listing' AS source,
       'identity_candidate' AS check_code,
       CASE WHEN property_candidate_count = 1 AND listing_candidate_count = 1 THEN 'medium' ELSE 'high' END AS severity,
       CASE WHEN property_candidate_count = 1 AND listing_candidate_count = 1 THEN 'safe_one_to_one_candidate' ELSE 'ambiguous_candidate' END AS candidate_class,
       property_id, listing_id, user_id, property_candidate_count, listing_candidate_count,
       'Fingerprint chỉ là routing hint; không tự link/đổi ownership' AS notes
FROM candidate_pairs
ORDER BY candidate_class, property_id, listing_id
LIMIT 500;

WITH duplicate_properties AS (
  SELECT md5(concat_ws('|', lower(regexp_replace(btrim(coalesce(p.title, '')), '\s+', ' ', 'g')),
    coalesce(p.price::text, ''), coalesce(p.price_unit, ''), coalesce(p.price_per_month::text, ''),
    coalesce(p.listing_type::text, ''), coalesce(p.area_sqm::text, ''), coalesce(p.address, ''),
    coalesce(p.city, ''), coalesce(p.district, ''), coalesce(p.ward, ''), coalesce(p.contact_phone, ''))) AS fingerprint,
    array_agg(p.id ORDER BY p.id) AS property_ids, count(*)::bigint AS row_count
  FROM public.properties p
  WHERE p.is_active
  GROUP BY 1 HAVING count(*) > 1
), duplicate_listings AS (
  SELECT md5(concat_ws('|', lower(regexp_replace(btrim(coalesce(l.title, '')), '\s+', ' ', 'g')),
    coalesce(l.price::text, ''), coalesce(l.price_unit, ''), coalesce(l.price_per_month::text, ''),
    coalesce(l.listing_type::text, ''), coalesce(l.area_sqm::text, ''), coalesce(l.address, ''),
    coalesce(l.city, ''), coalesce(l.district, ''), coalesce(l.ward, ''), coalesce(l.contact_phone, ''))) AS fingerprint,
    array_agg(l.id ORDER BY l.id) AS listing_ids, count(*)::bigint AS row_count
  FROM public.user_listings l
  WHERE l.status IN ('pending', 'approved')
  GROUP BY 1 HAVING count(*) > 1
)
SELECT now() AS measured_at, 'properties' AS source, 'duplicate_fingerprint_group' AS check_code,
       'high' AS severity, 'manual_review_duplicate' AS candidate_class,
       fingerprint, property_ids AS candidate_ids, row_count,
       'Exact fingerprint không chứng minh cùng tài sản; cần manual review' AS notes
FROM duplicate_properties
UNION ALL
SELECT now(), 'user_listings', 'duplicate_fingerprint_group', 'high', 'manual_review_duplicate',
       fingerprint, listing_ids, row_count,
       'Exact fingerprint không chứng minh cùng phiên đăng tin; cần manual review'
FROM duplicate_listings
ORDER BY source, row_count DESC, fingerprint;

-- 6) preflight_schema_security
WITH schema_rows AS (
  SELECT 'properties'::text AS source, p.id, p.is_active AS public_active, p.schema_markup
  FROM public.properties p
  WHERE p.schema_markup IS NOT NULL
  UNION ALL
  SELECT 'user_listings', l.id, l.status = 'approved', l.schema_markup
  FROM public.user_listings l
  WHERE l.schema_markup IS NOT NULL
), schema_checks AS (
  SELECT s.*,
    c.check_code, c.severity, c.is_violation, c.notes
  FROM schema_rows s
  CROSS JOIN LATERAL (VALUES
    ('schema_not_object', 'high', jsonb_typeof(s.schema_markup) IS DISTINCT FROM 'object', 'schema_markup phải là JSON object'),
    ('schema_oversized', 'high', octet_length(s.schema_markup::text) > 50000, 'schema_markup vượt giới hạn 50KB'),
    ('schema_unsafe_url', 'high', s.schema_markup::text ~* '(javascript:|vbscript:|data:text/html)', 'schema chứa URL scheme nguy hiểm'),
    ('schema_invalid_property_type', 'medium', (s.schema_markup ->> '@type') IS NOT NULL AND (s.schema_markup ->> '@type') NOT IN ('RealEstateListing', 'Offer', 'Residence', 'Place', 'VideoObject', 'BreadcrumbList'), 'schema @type ngoài allow-list property'),
    ('schema_missing_type', 'medium', (s.schema_markup ->> '@type') IS NULL, 'schema custom thiếu @type')
  ) AS c(check_code, severity, is_violation, notes)
)
SELECT now() AS measured_at, source, id, check_code, severity,
       CASE WHEN public_active THEN 'public_active' ELSE 'all' END AS scope,
       1::bigint AS row_count,
       notes
FROM schema_checks
WHERE is_violation
ORDER BY source, severity DESC, check_code, id;

SELECT now() AS measured_at, 'properties' AS source,
       'legacy_verification_flag' AS check_code,
       'medium' AS severity,
       'all' AS scope,
       count(*) FILTER (WHERE p.is_verified)::bigint AS row_count,
       'Legacy is_verified chỉ là compatibility data; không tự tạo evidence, scope hoặc public claim' AS notes
FROM public.properties p
WHERE p.is_verified;

SELECT now() AS measured_at, 'verification_model' AS source,
       expected.object_name AS id,
       'verification_object_presence' AS check_code,
       CASE WHEN expected.object_exists THEN 'low' ELSE 'medium' END AS severity,
       'all' AS scope,
       CASE WHEN expected.object_exists THEN 1::bigint ELSE 0::bigint END AS row_count,
       CASE WHEN expected.object_exists THEN 'Object/column có mặt; cần đọc-only verify tiếp theo'
            ELSE 'UNKNOWN — object/column chưa có trên database hiện tại' END AS notes
FROM (
  SELECT 'property_verification_cases'::text AS object_name,
         to_regclass('public.property_verification_cases') IS NOT NULL AS object_exists
  UNION ALL
  SELECT 'property_verification_evidence', to_regclass('public.property_verification_evidence') IS NOT NULL
  UNION ALL
  SELECT 'property_verification_events', to_regclass('public.property_verification_events') IS NOT NULL
  UNION ALL
  SELECT 'properties.verification_status', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'verification_status'
  )
  UNION ALL
  SELECT 'properties.verification_scope_codes', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'verification_scope_codes'
  )
  UNION ALL
  SELECT 'properties.verified_until', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'verified_until'
  )
) AS expected
ORDER BY object_name;

-- 7) preflight_runtime_inventory
SELECT now() AS measured_at, 'constraint' AS inventory_type,
       c.conrelid::regclass::text AS object_name, c.conname AS item_name,
       c.contype::text AS item_kind, c.convalidated::text AS validated,
       pg_get_constraintdef(c.oid) AS definition,
       NULL::boolean AS security_definer,
       NULL::text AS configuration,
       NULL::boolean AS anon_execute,
       NULL::boolean AS authenticated_execute
FROM pg_constraint c
JOIN pg_class rel ON rel.oid = c.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public'
  AND rel.relname IN ('properties', 'user_listings', 'wards', 'districts', 'neighborhoods')
  AND c.conname IN (
    'properties_area_positive', 'properties_bedrooms_nonnegative', 'properties_bathrooms_nonnegative',
    'properties_floor_count_nonnegative', 'properties_road_width_positive', 'properties_frontage_positive',
    'properties_coordinates_valid', 'user_listings_area_positive', 'user_listings_bedrooms_nonnegative',
    'user_listings_bathrooms_nonnegative', 'user_listings_coordinates_valid'
  )
ORDER BY object_name, item_name;

SELECT now() AS measured_at, 'trigger' AS inventory_type,
       c.oid::regclass::text AS object_name, t.tgname AS item_name,
       'trigger' AS item_kind, t.tgenabled::text AS validated,
       pg_get_triggerdef(t.oid) AS definition,
       NULL::boolean, NULL::text, NULL::boolean, NULL::boolean
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('properties', 'user_listings', 'wards', 'districts')
  AND NOT t.tgisinternal
ORDER BY object_name, item_name;

SELECT now() AS measured_at, 'function' AS inventory_type,
       n.nspname || '.' || p.proname AS object_name,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS item_name,
       'function' AS item_kind,
       NULL::text AS validated,
       NULL::text AS definition,
       p.prosecdef AS security_definer,
       coalesce(array_to_string(p.proconfig, ','), '') AS configuration,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'normalize_location_label', 'normalize_listing_title', 'taxonomy_geo_covers_point',
    'validate_listing_location_integrity', 'guard_pending_user_listing_quality',
    'approve_user_listing', 'capture_user_listing_lifecycle_event',
    'public_reveal_property_phone', 'public_submit_lead'
  )
ORDER BY object_name, item_name;

SELECT now() AS measured_at, 'rls_policy' AS inventory_type,
       schemaname || '.' || tablename AS object_name,
       policyname AS item_name,
       cmd AS item_kind,
       roles::text AS validated,
       'USING=' || coalesce(qual, '') || ' WITH_CHECK=' || coalesce(with_check, '') AS definition,
       NULL::boolean, NULL::text, NULL::boolean, NULL::boolean
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'properties', 'user_listings', 'leads', 'property_verification_cases',
    'property_verification_evidence', 'property_verification_events',
    'user_listing_lifecycle_events'
  )
ORDER BY object_name, item_name;

SELECT now() AS measured_at, 'table_privilege' AS inventory_type,
       n.nspname || '.' || c.relname AS object_name,
       privilege_type AS item_name,
       'table_privilege' AS item_kind,
       grantee AS validated,
       NULL::text AS definition,
       NULL::boolean, NULL::text,
       NULL::boolean, NULL::boolean
FROM information_schema.role_table_grants g
JOIN pg_class c ON c.relname = g.table_name
JOIN pg_namespace n ON n.nspname = g.table_schema AND n.oid = c.relnamespace
WHERE g.table_schema = 'public'
  AND g.table_name IN ('properties', 'user_listings', 'leads', 'property_verification_cases', 'user_listing_lifecycle_events')
  AND g.grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY object_name, validated, item_name;

ROLLBACK;
