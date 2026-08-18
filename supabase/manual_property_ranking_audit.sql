-- P5 ranking audit — READ ONLY, chạy SAU migration 20260903040000.
-- Baseline P4 đã được chụp bằng manual_property_search_audit.sql trước đó.
-- Script không INSERT/UPDATE/DELETE/DDL và không thay đổi production.

-- 1) Function owner, ACL và fixed search_path.
SELECT
  p.proname,
  pg_get_userbyid(p.proowner) AS owner_name,
  p.proacl,
  p.proconfig,
  pg_get_function_result(p.oid) AS result_contract
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('search_property_matches', 'match_properties_for_advisor')
ORDER BY p.proname;

-- 2) Definition markers. Kiểm tra organic không dùng HOT/featured/verified làm score;
-- advisor có monthly rental price, positive loan và reason payload.
SELECT
  p.proname,
  position('is_active = true' IN pg_get_functiondef(p.oid)) > 0 AS active_only,
  position('price_per_month' IN pg_get_functiondef(p.oid)) > 0 AS rental_price_marker,
  position('p.loan_support > 0' IN pg_get_functiondef(p.oid)) > 0 AS positive_loan_marker,
  position('match_reasons' IN pg_get_functiondef(p.oid)) > 0 AS reason_payload_marker,
  COALESCE('search_path=public, pg_temp' = ANY(p.proconfig), false) AS fixed_search_path_marker
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('search_property_matches', 'match_properties_for_advisor')
ORDER BY p.proname;

-- 3) Dữ liệu thật ảnh hưởng ranking, không suy diễn từ seed.
SELECT
  count(*) FILTER (WHERE is_active) AS active,
  count(*) FILTER (WHERE NOT is_active) AS inactive,
  count(*) FILTER (WHERE is_active AND listing_type = 'mua_ban') AS active_sale,
  count(*) FILTER (WHERE is_active AND listing_type = 'cho_thue') AS active_rental,
  count(*) FILTER (WHERE is_active AND created_at >= now() - interval '7 days') AS fresh_7d,
  count(*) FILTER (WHERE is_active AND created_at < now() - interval '7 days' AND created_at >= now() - interval '30 days') AS fresh_8_30d,
  count(*) FILTER (WHERE is_active AND created_at < now() - interval '30 days' AND created_at >= now() - interval '90 days') AS fresh_31_90d,
  count(*) FILTER (WHERE is_active AND created_at < now() - interval '90 days') AS older_90d,
  count(*) FILTER (WHERE is_active AND is_featured) AS featured,
  count(*) FILTER (WHERE is_active AND is_hot) AS hot,
  count(*) FILTER (WHERE is_active AND is_verified) AS verified
FROM public.properties;

-- 4) Organic relevance: hai lần gọi phải cùng ID/rank; không được có inactive.
WITH first_run AS (
  SELECT row_number() OVER () AS pos, *
  FROM public.search_property_matches(
    kw => 'Bán', f_sort => 'relevance', f_limit => 20, f_offset => 0
  )
),
second_run AS (
  SELECT row_number() OVER () AS pos, *
  FROM public.search_property_matches(
    kw => 'Bán', f_sort => 'relevance', f_limit => 20, f_offset => 0
  )
)
SELECT
  count(*) AS compared_rows,
  bool_and(first_run.id = second_run.id AND first_run.rank = second_run.rank) AS repeat_identical,
  count(*) FILTER (WHERE p.is_active IS DISTINCT FROM true) AS inactive_or_missing
FROM first_run
JOIN second_run USING (pos)
LEFT JOIN public.properties p ON p.id = first_run.id;

-- 5) Stable paging: không overlap giữa hai page relevance.
WITH page_1 AS (
  SELECT id FROM public.search_property_matches(
    kw => 'Bán', f_sort => 'relevance', f_limit => 10, f_offset => 0
  )
),
page_2 AS (
  SELECT id FROM public.search_property_matches(
    kw => 'Bán', f_sort => 'relevance', f_limit => 10, f_offset => 10
  )
)
SELECT count(*) AS page_overlap
FROM page_1 JOIN page_2 USING (id);

-- 6) Advisor representative call. Sau migration kết quả phải có
-- intent_score + match_reasons, và tất cả ID phải còn active.
SELECT *
FROM public.match_properties_for_advisor(
  f_listing_type => 'mua_ban',
  f_target_price => 3,
  f_target_area => 80,
  f_want_loan => true,
  kw => 'nhà',
  f_limit => 10
);

-- 7) Query plans đại diện. SQL Editor sẽ hiển thị plan thật; lưu output để so sánh,
-- không suy diễn timing/index nếu chưa có kết quả.
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT *
FROM public.search_property_matches(
  kw => 'Bán', f_sort => 'relevance', f_limit => 20, f_offset => 0
);

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT *
FROM public.match_properties_for_advisor(
  f_listing_type => 'mua_ban',
  f_target_price => 3,
  f_target_area => 80,
  f_want_loan => true,
  kw => 'nhà',
  f_limit => 10
);
