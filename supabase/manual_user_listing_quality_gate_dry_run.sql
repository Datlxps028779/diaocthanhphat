-- Read-only inventory before enabling listing quality guards.
-- Run this first and review real counts; this script performs no writes.

SELECT 'user_listings' AS source, status, count(*) AS rows
FROM public.user_listings
GROUP BY status
ORDER BY status;

SELECT 'properties' AS source, count(*) AS rows
FROM public.properties;

WITH rows AS (
  SELECT 'user_listings' AS source, title, area_sqm, bedrooms, bathrooms, NULL::numeric AS floor_count, latitude, longitude,
         price, price_per_month, loan_support, image_url, images, description, city, address, listing_type, status
  FROM public.user_listings
  UNION ALL
  SELECT 'properties', title, area_sqm, bedrooms, bathrooms, floor_count, latitude, longitude,
         price, price_per_month, loan_support, image_url, images, description, city, address, listing_type, NULL
  FROM public.properties
)
SELECT source,
  count(*) FILTER (WHERE title IS NULL OR btrim(title) = '') AS empty_title,
  count(*) FILTER (WHERE char_length(title) > 120) AS title_over_120,
  count(*) FILTER (WHERE area_sqm IS NOT NULL AND area_sqm <= 0) AS non_positive_area,
  count(*) FILTER (WHERE bedrooms IS NOT NULL AND (bedrooms < 0 OR bedrooms <> trunc(bedrooms))) AS invalid_bedrooms,
  count(*) FILTER (WHERE bathrooms IS NOT NULL AND (bathrooms < 0 OR bathrooms <> trunc(bathrooms))) AS invalid_bathrooms,
  count(*) FILTER (WHERE source = 'properties' AND floor_count IS NOT NULL AND floor_count < 0) AS invalid_floor_count,
  count(*) FILTER (WHERE (latitude IS NULL) <> (longitude IS NULL)) AS incomplete_coordinates,
  count(*) FILTER (WHERE latitude IS NOT NULL AND (latitude < -90 OR latitude > 90 OR longitude < -180 OR longitude > 180)) AS out_of_range_coordinates,
  count(*) FILTER (WHERE listing_type = 'mua_ban' AND (price IS NULL OR price <= 0)) AS invalid_sale_price,
  count(*) FILTER (WHERE listing_type = 'cho_thue' AND COALESCE(price_per_month, price) <= 0) AS invalid_rent_price,
  count(*) FILTER (WHERE image_url IS NULL AND COALESCE(array_length(images, 1), 0) = 0) AS missing_image,
  count(*) FILTER (WHERE regexp_replace(regexp_replace(COALESCE(description, ''), '<[^>]*>', ' ', 'g'), '&(nbsp|amp|lt|gt|quot|#39);', ' ', 'gi') ~ '[[:alnum:]]') AS has_text_description,
  count(*) FILTER (WHERE status = 'pending' AND (address IS NULL OR btrim(address) = '') AND (latitude IS NULL OR longitude IS NULL)) AS missing_address_and_coordinates
FROM rows
GROUP BY source;

SELECT key, value
FROM public.site_settings
WHERE key IN ('site_logo_text', 'site_logo_sub', 'phone_hotline', 'phone_main', 'email', 'address')
ORDER BY key;
