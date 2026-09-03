-- Read-only preflight for 20260925000000_property_engagement_and_phone_reveal.sql.
-- Run before the production migration. This file performs no writes.

SELECT
  to_regclass('public.properties') AS properties_table,
  to_regclass('public.leads') AS leads_table,
  to_regclass('public.user_listings') AS user_listings_table,
  to_regclass('public.property_phone_reveal_events') AS reveal_events_table;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'views'
  ) AS properties_views_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'contact_phone'
  ) AS properties_contact_phone_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'source'
  ) AS leads_source_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_listings' AND column_name = 'user_id'
  ) AS user_listing_owner_exists;

SELECT
  COUNT(*) AS active_properties,
  COUNT(*) FILTER (WHERE COALESCE(views, 0) > 0) AS active_properties_with_views,
  COALESCE(SUM(GREATEST(COALESCE(views, 0), 0)), 0) AS total_active_views,
  MAX(COALESCE(views, 0)) AS max_active_views
FROM public.properties
WHERE is_active = true;

SELECT
  COUNT(*) AS approved_active_user_listings,
  COUNT(*) FILTER (WHERE ul.user_id IS NOT NULL) AS with_explicit_owner,
  COUNT(*) FILTER (WHERE ul.user_id IS NULL) AS without_explicit_owner
FROM public.user_listings ul
JOIN public.properties p ON p.id = ul.property_id
WHERE ul.status = 'approved' AND p.is_active = true;

SELECT
  l.source,
  COUNT(*) AS lead_count,
  COUNT(*) FILTER (WHERE l.property_id IS NOT NULL) AS linked_property_leads
FROM public.leads l
GROUP BY l.source
ORDER BY lead_count DESC, l.source NULLS FIRST;

SELECT
  COUNT(*) AS reveal_events,
  COUNT(DISTINCT property_id) AS properties_with_reveals,
  COUNT(DISTINCT lead_id) AS linked_leads,
  COUNT(*) FILTER (WHERE day_bucket = CURRENT_DATE) AS reveals_today
FROM public.property_phone_reveal_events;

SELECT
  e.property_id,
  e.session_hash,
  e.day_bucket,
  COUNT(*) AS duplicate_count
FROM public.property_phone_reveal_events e
GROUP BY e.property_id, e.session_hash, e.day_bucket
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 50;

SELECT
  to_regprocedure('public.increment_property_views(uuid)') IS NOT NULL AS increment_views_exists,
  to_regprocedure('public.public_reveal_property_phone(uuid,text,text,text)') IS NOT NULL AS reveal_rpc_exists,
  to_regprocedure('public.get_my_property_engagement()') IS NOT NULL AS owner_engagement_exists,
  to_regprocedure('public.admin_get_property_engagement(uuid[])') IS NOT NULL AS admin_engagement_exists,
  to_regprocedure('public.public_get_property_agent(uuid)') IS NOT NULL AS property_agent_exists;

SELECT
  CASE WHEN to_regprocedure('public.public_reveal_property_phone(uuid,text,text,text)') IS NULL THEN false
       ELSE has_function_privilege('anon', to_regprocedure('public.public_reveal_property_phone(uuid,text,text,text)'), 'EXECUTE') END AS anon_can_reveal,
  CASE WHEN to_regprocedure('public.public_reveal_property_phone(uuid,text,text,text)') IS NULL THEN false
       ELSE has_function_privilege('authenticated', to_regprocedure('public.public_reveal_property_phone(uuid,text,text,text)'), 'EXECUTE') END AS authenticated_can_reveal,
  CASE WHEN to_regprocedure('public.get_my_property_engagement()') IS NULL THEN false
       ELSE has_function_privilege('anon', to_regprocedure('public.get_my_property_engagement()'), 'EXECUTE') END AS anon_can_read_owner_stats,
  CASE WHEN to_regprocedure('public.admin_get_property_engagement(uuid[])') IS NULL THEN false
       ELSE has_function_privilege('anon', to_regprocedure('public.admin_get_property_engagement(uuid[])'), 'EXECUTE') END AS anon_can_read_admin_stats,
  CASE WHEN to_regprocedure('public.admin_get_property_engagement(uuid[])') IS NULL THEN false
       ELSE has_function_privilege('authenticated', to_regprocedure('public.admin_get_property_engagement(uuid[])'), 'EXECUTE') END AS authenticated_can_call_admin_stats;

SELECT
  polname AS policy_name,
  polcmd AS command,
  polroles::regrole[] AS roles
FROM pg_policy
WHERE polrelid = 'public.property_phone_reveal_events'::regclass;
