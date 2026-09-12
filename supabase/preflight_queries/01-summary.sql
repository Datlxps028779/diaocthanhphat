-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

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

ROLLBACK;
