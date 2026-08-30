-- Read-only verification after polygon seed + coordinate taxonomy migration.

SELECT extname, extversion, extnamespace::regnamespace AS extension_schema
FROM pg_extension
WHERE extname = 'postgis';

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('user_listings', 'properties')
  AND column_name = 'ward_id'
ORDER BY table_name;

SELECT to_regprocedure('public.taxonomy_geo_covers_point(text,uuid,numeric,numeric)') AS covers_function,
       to_regprocedure('public.validate_listing_location_integrity()') AS integrity_trigger_function,
       has_function_privilege('anon', 'public.taxonomy_geo_covers_point(text,uuid,numeric,numeric)'::regprocedure, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', 'public.taxonomy_geo_covers_point(text,uuid,numeric,numeric)'::regprocedure, 'EXECUTE') AS authenticated_can_execute;

SELECT entity_type,
       count(*) FILTER (WHERE is_published) AS published_rows,
       count(*) FILTER (WHERE is_published AND geojson IS NOT NULL) AS published_polygon_rows
FROM public.taxonomy_geo
WHERE source = 'Kontur Boundaries Vietnam 20230628'
  AND administrative_vintage = 'legacy_pre_merger'
GROUP BY entity_type
ORDER BY entity_type;

SELECT tgname, tgrelid::regclass AS table_name, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgname IN (
  'trg_properties_location_integrity',
  'trg_user_listings_location_integrity',
  'trg_guard_pending_user_listing_quality',
  'trg_wards_protect_referenced_location'
)
ORDER BY tgname;

WITH target AS (
  SELECT ward.id AS ward_id, geo.center_lat, geo.center_lng
  FROM public.wards ward
  JOIN public.districts district ON district.id = ward.district_id
  JOIN public.areas area ON area.id = district.area_id
  JOIN public.taxonomy_geo geo
    ON geo.entity_type = 'ward'
   AND geo.entity_id = ward.id
   AND geo.is_published
   AND geo.administrative_vintage = 'legacy_pre_merger'
  WHERE public.normalize_location_label(area.name) = public.normalize_location_label('Bình Dương')
    AND public.normalize_location_label(district.name) = public.normalize_location_label('Thuận An')
    AND public.normalize_location_label(ward.name) = public.normalize_location_label('An Phú')
)
SELECT ward_id, center_lat, center_lng,
       public.taxonomy_geo_covers_point('ward', ward_id, center_lat, center_lng) AS center_is_covered,
       public.taxonomy_geo_covers_point('ward', ward_id, 10.895430, 106.695699) AS reported_wrong_point_is_covered
FROM target;

SELECT 'user_listings' AS source, count(*) AS invalid_rows
FROM public.user_listings listing
WHERE (listing.latitude IS NOT NULL OR listing.longitude IS NOT NULL)
  AND (
    listing.latitude IS NULL
    OR listing.longitude IS NULL
    OR listing.ward_id IS NULL
    OR NOT public.taxonomy_geo_covers_point('ward', listing.ward_id, listing.latitude, listing.longitude)
  )
UNION ALL
SELECT 'properties', count(*)
FROM public.properties property
WHERE (property.latitude IS NOT NULL OR property.longitude IS NOT NULL)
  AND (
    property.latitude IS NULL
    OR property.longitude IS NULL
    OR property.ward_id IS NULL
    OR NOT public.taxonomy_geo_covers_point('ward', property.ward_id, property.latitude, property.longitude)
  );
