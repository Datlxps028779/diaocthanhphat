-- =============================================================================
-- P3B — Read-only verification for user-listing lifecycle audit
-- =============================================================================
-- Run section 1 before migration as the baseline. Run the complete file after the
-- migration is installed; sections 2-5 require the new audit table/function.

-- 1) Current lifecycle distribution and property-link consistency.
SELECT
  l.status,
  count(*) AS listing_count,
  count(*) FILTER (WHERE l.property_id IS NULL) AS without_property_id,
  count(*) FILTER (WHERE l.property_id IS NOT NULL AND p.id IS NULL) AS dangling_property_id,
  count(*) FILTER (WHERE l.status = 'approved' AND COALESCE(p.is_active, false) = false) AS approved_without_active_property,
  count(*) FILTER (WHERE l.status <> 'approved' AND COALESCE(p.is_active, false) = true) AS unpublished_with_active_property
FROM public.user_listings l
LEFT JOIN public.properties p ON p.id = l.property_id
GROUP BY l.status
ORDER BY l.status;

-- 2) Event volume by type (empty before P3B is installed).
SELECT event_type, count(*) AS event_count, min(occurred_at) AS first_event, max(occurred_at) AS latest_event
FROM public.user_listing_lifecycle_events
GROUP BY event_type
ORDER BY event_type;

-- 3) Current listings whose latest event conflicts with current status.
-- Existing rows may have no event because history intentionally starts at P3B install.
WITH latest AS (
  SELECT DISTINCT ON (listing_id)
    listing_id, event_type, to_status, occurred_at
  FROM public.user_listing_lifecycle_events
  WHERE listing_id IS NOT NULL
  ORDER BY listing_id, occurred_at DESC, id DESC
)
SELECT l.id, l.status, latest.event_type, latest.to_status, latest.occurred_at
FROM public.user_listings l
JOIN latest ON latest.listing_id = l.id
WHERE latest.to_status IS NOT NULL
  AND latest.to_status IS DISTINCT FROM l.status
ORDER BY latest.occurred_at DESC;

-- 4) Malformed or impossible event rows.
SELECT id, listing_id, event_type, from_status, to_status, actor_role, metadata, occurred_at
FROM public.user_listing_lifecycle_events
WHERE listing_owner_id IS NULL
   OR jsonb_typeof(metadata) IS DISTINCT FROM 'object'
   OR (event_type = 'submitted' AND (from_status IS NOT NULL OR to_status IS NULL))
   OR (event_type = 'approved' AND to_status IS DISTINCT FROM 'approved')
   OR (event_type = 'rejected' AND to_status IS DISTINCT FROM 'rejected')
   OR (event_type = 'expired' AND to_status IS DISTINCT FROM 'expired')
   OR (event_type IN ('renewed', 'resubmitted') AND to_status IS DISTINCT FROM 'pending')
   OR (event_type = 'deleted' AND (from_status IS NULL OR listing_id IS NOT NULL))
ORDER BY occurred_at DESC
LIMIT 100;

-- 5) Confirm table RLS, grants, trigger and fixed function configuration.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_can_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_can_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_can_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_can_delete,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'user_listing_lifecycle_events';

SELECT
  p.proname AS function_name,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'capture_user_listing_lifecycle_event';

SELECT
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'user_listings'
  AND t.tgname = 'trg_user_listing_lifecycle_event'
  AND NOT t.tgisinternal;
