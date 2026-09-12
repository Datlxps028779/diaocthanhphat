-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

WITH latest_event AS (
  SELECT DISTINCT ON (listing_id) listing_id, event_type, to_status, occurred_at
  FROM public.user_listing_lifecycle_events
  WHERE listing_id IS NOT NULL
  ORDER BY listing_id, occurred_at DESC, id DESC
)
SELECT now() AS measured_at, 'user_listing_lifecycle_events' AS source,
       'latest_event_status_mismatch' AS check_code, 'high' AS severity, 'all' AS scope,
       count(*)::bigint AS row_count,
       'Latest lifecycle event disagrees with current user_listing.status' AS notes
FROM public.user_listings l
JOIN latest_event e ON e.listing_id = l.id
WHERE e.to_status IS NOT NULL AND e.to_status IS DISTINCT FROM l.status;

ROLLBACK;
