-- =============================================================================
-- P4 — Read-only production audit for public property search
-- =============================================================================
-- Không tạo index/function, không ghi log và không mutation dữ liệu. Chạy trong
-- Supabase SQL Editor để lấy catalog + EXPLAIN (ANALYZE, BUFFERS) bằng dữ liệu thật.

-- 1) Live RPC definition, owner, volatility and browser grants.
SELECT
  p.oid::regprocedure AS function_signature,
  pg_get_userbyid(p.proowner) AS owner,
  l.lanname AS language,
  p.provolatile AS volatility,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname = 'search_property_matches';

-- 2) Extensions/functions/indexes that may support current search paths.
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('unaccent', 'pg_trgm')
ORDER BY extname;

SELECT
  p.oid::regprocedure AS function_signature,
  p.provolatile AS volatility,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('f_unaccent', 'property_ai_search_vector')
ORDER BY p.proname, p.oid::regprocedure::text;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'properties'
  AND (
    indexname ILIKE '%search%'
    OR indexname ILIKE '%trgm%'
    OR indexname ILIKE '%active%'
    OR indexname ILIKE '%listing%'
    OR indexname ILIKE '%price%'
  )
ORDER BY indexname;

-- 3) Real distribution and filter-field coverage.
SELECT
  is_active,
  listing_type,
  count(*) AS property_count,
  count(*) FILTER (WHERE area_id IS NOT NULL) AS with_area,
  count(*) FILTER (WHERE property_type_id IS NOT NULL) AS with_type,
  count(*) FILTER (WHERE district IS NOT NULL AND btrim(district) <> '') AS with_district,
  count(*) FILTER (WHERE ward IS NOT NULL AND btrim(ward) <> '') AS with_ward,
  count(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS with_coordinates,
  count(*) FILTER (WHERE is_verified) AS verified,
  count(*) FILTER (WHERE is_featured) AS featured,
  count(*) FILTER (WHERE is_hot) AS hot
FROM public.properties
GROUP BY is_active, listing_type
ORDER BY is_active DESC, listing_type;

SELECT
  area_id,
  listing_type,
  count(*) AS active_count
FROM public.properties
WHERE is_active = true
GROUP BY area_id, listing_type
ORDER BY active_count DESC, area_id, listing_type;

-- 4) Current rank inputs. P4 only documents these; separating organic/commercial
-- policy belongs to P5.
SELECT
  count(*) FILTER (WHERE is_active) AS active_total,
  count(*) FILTER (WHERE is_active AND is_verified) AS active_verified,
  count(*) FILTER (WHERE is_active AND is_hot) AS active_hot,
  count(*) FILTER (WHERE is_active AND is_featured) AS active_featured
FROM public.properties;

-- 5) Choose representative real values without inventing a province/type/keyword.
WITH representative AS (
  SELECT
    p.area_id,
    p.property_type_id,
    p.listing_type,
    split_part(btrim(p.title), ' ', 1) AS keyword
  FROM public.properties p
  WHERE p.is_active = true
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT 1
)
SELECT * FROM representative;

-- 6) RPC visibility: every returned ID must still be active. Use the representative
-- keyword printed above in place of :keyword if SQL Editor does not support variables.
WITH matches AS (
  SELECT *
  FROM public.search_property_matches(
    kw => NULL,
    f_listing_type => NULL,
    f_area_id => NULL,
    f_type_id => NULL,
    f_city => NULL,
    f_district => NULL,
    f_ward => NULL,
    f_min_price => NULL,
    f_max_price => NULL,
    f_min_area => NULL,
    f_max_area => NULL,
    f_bedrooms => NULL,
    f_direction => NULL,
    f_legal => NULL,
    f_featured => NULL,
    f_hot => NULL,
    f_sort => 'newest',
    f_limit => 50,
    f_offset => 0
  )
)
SELECT
  count(*) AS returned_rows,
  count(*) FILTER (WHERE p.id IS NULL OR p.is_active IS DISTINCT FROM true) AS inactive_or_missing_rows
FROM matches m
LEFT JOIN public.properties p ON p.id = m.id;

-- 7) Stable paging/no overlap. Repeat this query twice; the arrays must be identical.
WITH page_1 AS (
  SELECT * FROM public.search_property_matches(
    f_sort => 'newest', f_limit => 10, f_offset => 0
  )
),
page_2 AS (
  SELECT * FROM public.search_property_matches(
    f_sort => 'newest', f_limit => 10, f_offset => 10
  )
)
SELECT
  (SELECT array_agg(id ORDER BY ord) FROM (
    SELECT id, row_number() OVER () AS ord FROM page_1
  ) x) AS page_1_ids,
  (SELECT array_agg(id ORDER BY ord) FROM (
    SELECT id, row_number() OVER () AS ord FROM page_2
  ) x) AS page_2_ids,
  (SELECT count(*) FROM page_1 a JOIN page_2 b USING (id)) AS overlap_count;

-- 8) Contract markers in live definition: rental price and deterministic ID tie-breaker.
SELECT
  pg_get_functiondef(p.oid) ILIKE '%price_per_month%' AS uses_monthly_rental_price,
  pg_get_functiondef(p.oid) ~* 'price_asc[^;]+id' AS price_asc_has_id_tiebreaker,
  pg_get_functiondef(p.oid) ~* 'price_desc[^;]+id' AS price_desc_has_id_tiebreaker,
  pg_get_functiondef(p.oid) ~* 'views[^;]+id' AS views_has_id_tiebreaker,
  pg_get_functiondef(p.oid) ~* 'newest[^;]+id' AS newest_has_id_tiebreaker,
  pg_get_functiondef(p.oid) ILIKE '%p.is_active = true%' AS rpc_enforces_active_only
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'search_property_matches';

-- 9) Representative direct filter/newest plan. Replace UUIDs only with values from
-- section 5 if the latest row has NULL taxonomy.
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT p.id, p.created_at
FROM public.properties p
WHERE p.is_active = true
  AND p.listing_type = (
    SELECT listing_type FROM public.properties
    WHERE is_active = true
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  )
  AND p.area_id = (
    SELECT area_id FROM public.properties
    WHERE is_active = true AND area_id IS NOT NULL
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  )
ORDER BY p.created_at DESC, p.id DESC
LIMIT 20;

-- 10) Representative keyword/relevance RPC plan using a token from a real title.
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM public.search_property_matches(
  kw => (
    SELECT split_part(btrim(title), ' ', 1)
    FROM public.properties
    WHERE is_active = true AND btrim(title) <> ''
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  ),
  f_sort => 'relevance',
  f_limit => 20,
  f_offset => 0
);
