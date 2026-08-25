-- Read-only checks before running 20260903050000_admin_pending_listing_review.sql
-- and 20260903060000_listing_review_media_policy.sql in production.
SELECT to_regclass('public.user_listings') AS user_listings_table,
       to_regclass('public.user_listing_lifecycle_events') AS lifecycle_table;

SELECT proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('approve_user_listing', 'admin_update_pending_user_listing');

SELECT policyname, schemaname, tablename, cmd
FROM pg_policies
WHERE (schemaname = 'public' AND tablename = 'user_listings')
   OR (schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%listing_review%')
ORDER BY schemaname, tablename, policyname;

SELECT event_type, count(*) AS count
FROM public.user_listing_lifecycle_events
GROUP BY event_type
ORDER BY event_type;
