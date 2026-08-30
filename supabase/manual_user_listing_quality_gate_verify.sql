-- Read-only verification for 20260913000000_user_listing_quality_guards.sql.
SELECT conname, convalidated, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
  'user_listings_area_positive', 'user_listings_bedrooms_nonnegative',
  'user_listings_bathrooms_nonnegative', 'user_listings_coordinates_valid',
  'properties_area_positive', 'properties_bedrooms_nonnegative',
  'properties_bathrooms_nonnegative', 'properties_floor_count_nonnegative',
  'properties_road_width_positive', 'properties_frontage_positive', 'properties_coordinates_valid'
)
ORDER BY conname;

SELECT to_regprocedure('public.listing_plain_text(text)') AS plain_text_function,
       to_regprocedure('public.guard_pending_user_listing_quality()') AS quality_guard,
       has_function_privilege('anon', 'public.guard_pending_user_listing_quality()'::regprocedure, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', 'public.guard_pending_user_listing_quality()'::regprocedure, 'EXECUTE') AS authenticated_can_execute;

SELECT tgname, tgrelid::regclass AS table_name, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgname = 'trg_guard_pending_user_listing_quality';
