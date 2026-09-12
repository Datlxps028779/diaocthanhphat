-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

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

ROLLBACK;
