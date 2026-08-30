-- Read-only inventory before enabling exact ward/polygon coordinate guards.

SELECT name, default_version, installed_version
FROM pg_available_extensions
WHERE name = 'postgis';

SELECT count(*) AS wards_without_district
FROM public.wards
WHERE district_id IS NULL;

SELECT entity_type,
       count(*) FILTER (WHERE is_published) AS published_rows,
       count(*) FILTER (WHERE is_published AND geojson IS NOT NULL) AS published_polygon_rows
FROM public.taxonomy_geo
WHERE source = 'Kontur Boundaries Vietnam 20230628'
  AND administrative_vintage = 'legacy_pre_merger'
GROUP BY entity_type
ORDER BY entity_type;

WITH candidates AS (
  SELECT 'user_listings'::text AS source, listing.id,
         count(ward.id) AS exact_matches
  FROM public.user_listings listing
  LEFT JOIN public.wards ward
    ON ward.district_id = listing.district_id
   AND public.normalize_location_label(ward.name) = public.normalize_location_label(listing.ward)
  WHERE listing.district_id IS NOT NULL
    AND public.normalize_location_label(listing.ward) IS NOT NULL
  GROUP BY listing.id
  UNION ALL
  SELECT 'properties', property.id, count(ward.id)
  FROM public.properties property
  LEFT JOIN public.wards ward
    ON ward.district_id = property.district_id
   AND public.normalize_location_label(ward.name) = public.normalize_location_label(property.ward)
  WHERE property.district_id IS NOT NULL
    AND public.normalize_location_label(property.ward) IS NOT NULL
  GROUP BY property.id
)
SELECT source,
       count(*) FILTER (WHERE exact_matches = 1) AS safe_backfill,
       count(*) FILTER (WHERE exact_matches = 0) AS unmatched,
       count(*) FILTER (WHERE exact_matches > 1) AS ambiguous
FROM candidates
GROUP BY source
ORDER BY source;

SELECT 'user_listings' AS source,
       count(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) AS rows_with_coordinates,
       count(*) FILTER (WHERE (latitude IS NULL) <> (longitude IS NULL)) AS incomplete_coordinate_pairs
FROM public.user_listings
UNION ALL
SELECT 'properties',
       count(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL),
       count(*) FILTER (WHERE (latitude IS NULL) <> (longitude IS NULL))
FROM public.properties;

SELECT area.name AS area_name, district.name AS district_name, ward.name AS ward_name,
       ward.id AS ward_id, geo.bounds, geo.geojson IS NOT NULL AS has_polygon
FROM public.wards ward
JOIN public.districts district ON district.id = ward.district_id
JOIN public.areas area ON area.id = district.area_id
LEFT JOIN public.taxonomy_geo geo
  ON geo.entity_type = 'ward'
 AND geo.entity_id = ward.id
 AND geo.is_published
 AND geo.administrative_vintage = 'legacy_pre_merger'
WHERE public.normalize_location_label(area.name) = public.normalize_location_label('Bình Dương')
  AND public.normalize_location_label(district.name) = public.normalize_location_label('Thuận An')
  AND public.normalize_location_label(ward.name) = public.normalize_location_label('An Phú');
