-- Read-only dry run for 20260908000000_news_structured_location.sql
-- Run this in Supabase SQL Editor BEFORE the migration. It deliberately does not
-- parse geo_area/geo_entity and makes no changes to existing news rows.

-- 1) Confirm the migration does not need a backfill: all current structured IDs
-- should be absent before first rollout, while free-form GEO remains narrative.
SELECT
  count(*) AS total_news,
  count(*) FILTER (WHERE is_published) AS published_news,
  count(*) FILTER (WHERE geo_area IS NOT NULL AND btrim(geo_area) <> '') AS with_geo_area_text,
  count(*) FILTER (WHERE geo_entity IS NOT NULL AND btrim(geo_entity) <> '') AS with_geo_entity_text
FROM public.news;

-- 2) Inspect existing FK columns if this dry run is re-used after migration.
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'news'
  AND column_name IN ('area_id', 'district_id', 'ward_id', 'neighborhood_id')
ORDER BY column_name;

-- 3) Prove all taxonomy tables are available for the picker.
SELECT
  (SELECT count(*) FROM public.areas) AS areas,
  (SELECT count(*) FROM public.districts) AS districts,
  (SELECT count(*) FROM public.wards) AS wards,
  (SELECT count(*) FROM public.neighborhoods) AS neighborhoods;

-- 4) After migration and editorial selection, this query must return zero rows.
SELECT n.id, n.slug, n.title,
       n.area_id, n.district_id, n.ward_id, n.neighborhood_id,
       d.area_id AS district_area_id,
       w.district_id AS ward_district_id,
       nh.area_id AS neighborhood_area_id,
       nh.district_id AS neighborhood_district_id,
       nh.ward_id AS neighborhood_ward_id
FROM public.news n
LEFT JOIN public.districts d ON d.id = n.district_id
LEFT JOIN public.wards w ON w.id = n.ward_id
LEFT JOIN public.neighborhoods nh ON nh.id = n.neighborhood_id
WHERE (n.area_id IS NOT NULL AND d.area_id IS NOT NULL AND n.area_id <> d.area_id)
   OR (n.district_id IS NOT NULL AND w.district_id IS NOT NULL AND n.district_id <> w.district_id)
   OR (n.area_id IS NOT NULL AND nh.area_id IS NOT NULL AND n.area_id <> nh.area_id)
   OR (n.district_id IS NOT NULL AND nh.district_id IS NOT NULL AND n.district_id <> nh.district_id)
   OR (n.ward_id IS NOT NULL AND nh.ward_id IS NOT NULL AND n.ward_id <> nh.ward_id)
ORDER BY n.updated_at DESC, n.id DESC;
