-- =============================================================================
-- P3C — Read-only verification for listing expiry/publication ownership
-- =============================================================================
-- Run before and after migration 20260903020000. This file never calls
-- expire_due_listings(), because that function mutates due production rows.

-- 1) Listing expiry horizon and current linked-property consistency.
SELECT
  l.status,
  count(*) AS listing_count,
  count(*) FILTER (WHERE l.expires_at IS NULL) AS without_expiry,
  count(*) FILTER (WHERE l.expires_at <= now()) AS already_due,
  count(*) FILTER (
    WHERE l.expires_at > now()
      AND l.expires_at <= now() + interval '7 days'
  ) AS expires_within_7_days,
  count(*) FILTER (
    WHERE l.expires_at > now()
      AND l.expires_at <= now() + interval '30 days'
  ) AS expires_within_30_days,
  count(*) FILTER (
    WHERE l.expires_at > now()
      AND l.expires_at <= now() + interval '60 days'
  ) AS expires_within_60_days,
  count(*) FILTER (
    WHERE l.status = 'approved'
      AND COALESCE(p.is_active, false) = false
  ) AS approved_without_active_property,
  count(*) FILTER (
    WHERE l.status <> 'approved'
      AND COALESCE(p.is_active, false) = true
  ) AS unpublished_with_active_property
FROM public.user_listings l
LEFT JOIN public.properties p ON p.id = l.property_id
GROUP BY l.status
ORDER BY l.status;

-- 2) Keep independent Admin properties outside the user-listing lifecycle.
SELECT
  count(*) FILTER (
    WHERE p.is_active
      AND l.id IS NULL
  ) AS active_independent_properties,
  count(*) FILTER (
    WHERE NOT p.is_active
      AND l.id IS NULL
  ) AS inactive_independent_properties,
  count(*) FILTER (WHERE l.id IS NOT NULL) AS linked_user_listing_properties
FROM public.properties p
LEFT JOIN public.user_listings l ON l.property_id = p.id;

-- 3) Function configuration and privileges. After P3C, browser roles must be
-- denied while the postgres owner/cron role retains execution.
SELECT
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS function_owner,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config,
  NOT aclcontains(
    COALESCE(p.proacl, acldefault('f', p.proowner)),
    makeaclitem(0, p.proowner, 'EXECUTE', false)
  ) AS public_execute_revoked,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('postgres', p.oid, 'EXECUTE') AS postgres_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'expire_due_listings',
    'hide_property_when_listing_unpublished'
  )
ORDER BY p.proname;

-- 4) The existing cron job must remain active and owned by postgres. P3C does
-- not reschedule it.
SELECT
  j.jobid,
  j.jobname,
  j.schedule,
  j.username,
  j.database,
  j.active,
  j.command
FROM cron.job j
WHERE j.jobname = 'expire-due-listings';

SELECT
  d.status,
  count(*) AS run_count,
  max(d.end_time) AS latest_end
FROM cron.job_run_details d
WHERE d.command ILIKE '%expire_due_listings%'
GROUP BY d.status
ORDER BY d.status;

-- 5) Both lifecycle triggers must still be attached to user_listings.
SELECT
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'user_listings'
  AND t.tgname IN (
    'trg_hide_property_on_unpublish',
    'trg_user_listing_lifecycle_event'
  )
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 6) P3B audit remains structurally valid. Existing rows may have no event
-- because P3B deliberately did not fabricate historical transitions.
WITH latest AS (
  SELECT DISTINCT ON (listing_id)
    listing_id,
    to_status,
    occurred_at
  FROM public.user_listing_lifecycle_events
  WHERE listing_id IS NOT NULL
  ORDER BY listing_id, occurred_at DESC, id DESC
)
SELECT count(*) AS latest_event_status_mismatches
FROM public.user_listings l
JOIN latest ON latest.listing_id = l.id
WHERE latest.to_status IS NOT NULL
  AND latest.to_status IS DISTINCT FROM l.status;

SELECT count(*) AS malformed_events
FROM public.user_listing_lifecycle_events
WHERE listing_owner_id IS NULL
   OR jsonb_typeof(metadata) IS DISTINCT FROM 'object'
   OR (event_type = 'expired' AND to_status IS DISTINCT FROM 'expired')
   OR (event_type = 'deleted' AND (from_status IS NULL OR listing_id IS NOT NULL));
