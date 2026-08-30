-- Read-only review for the generated Kontur legacy bounds seed.
-- Run before manual_taxonomy_geo_kontur_seed.sql. No writes are performed.

SELECT
  (SELECT count(*) FROM public.areas) AS areas_in_db,
  (SELECT count(*) FROM public.districts) AS districts_in_db,
  (SELECT count(*) FROM public.wards) AS wards_in_db,
  (SELECT count(*) FROM public.taxonomy_geo WHERE source = 'Kontur Boundaries Vietnam 20230628') AS existing_kontur_rows,
  (SELECT count(*) FROM public.taxonomy_geo WHERE is_published AND source = 'Kontur Boundaries Vietnam 20230628') AS published_kontur_rows;

-- The generated safe set contains 4 area, 53 district and 645 ward matches.
SELECT entity_type, count(*) AS existing_rows,
       count(*) FILTER (WHERE is_published) AS published_rows,
       count(*) FILTER (WHERE administrative_vintage <> 'legacy_pre_merger') AS wrong_vintage_rows
FROM public.taxonomy_geo
WHERE source = 'Kontur Boundaries Vietnam 20230628'
GROUP BY entity_type
ORDER BY entity_type;

-- The acceptance target must be present after seed/review.
SELECT a.name AS area, d.name AS district, w.name AS ward,
       tg.id AS geometry_id, tg.bounds, tg.center_lat, tg.center_lng,
       tg.source, tg.administrative_vintage, tg.is_published
FROM public.areas a
JOIN public.districts d ON d.area_id = a.id
JOIN public.wards w ON w.district_id = d.id
LEFT JOIN public.taxonomy_geo tg
  ON tg.entity_type = 'ward'
 AND tg.entity_id = w.id
 AND tg.source = 'Kontur Boundaries Vietnam 20230628'
WHERE a.name = 'Bình Dương'
  AND d.name = 'Thủ Dầu Một'
  AND w.name = 'Hiệp Thành';

-- Any published geometry without a matching taxonomy row is unsafe.
SELECT tg.entity_type, tg.entity_id, tg.is_published
FROM public.taxonomy_geo tg
WHERE tg.source = 'Kontur Boundaries Vietnam 20230628'
  AND tg.is_published
  AND NOT (
    (tg.entity_type = 'area' AND EXISTS (SELECT 1 FROM public.areas a WHERE a.id = tg.entity_id))
    OR (tg.entity_type = 'district' AND EXISTS (SELECT 1 FROM public.districts d WHERE d.id = tg.entity_id))
    OR (tg.entity_type = 'ward' AND EXISTS (SELECT 1 FROM public.wards w WHERE w.id = tg.entity_id))
  );
