-- P15 read-only production measurement. Run this script before applying the workspace migration.

SELECT 'agent_profile_counts' AS section,
       COUNT(*)::integer AS total_profiles,
       COUNT(*) FILTER (WHERE status = 'published')::integer AS published_profiles,
       COUNT(*) FILTER (WHERE status = 'draft')::integer AS draft_profiles,
       COUNT(*) FILTER (WHERE status = 'disabled')::integer AS disabled_profiles
FROM public.agent_profiles;

SELECT 'profile_owner_roles' AS section,
       p.role,
       COUNT(*)::integer AS profile_count
FROM public.agent_profiles ap
JOIN public.profiles p ON p.id = ap.user_id
GROUP BY p.role
ORDER BY p.role;

SELECT 'profile_role_consistency' AS section,
       COUNT(*)::integer AS total_profiles,
       COUNT(*) FILTER (WHERE p.role = 'user')::integer AS customer_profiles,
       COUNT(*) FILTER (WHERE p.role IN ('staff', 'admin'))::integer AS internal_role_profiles,
       COUNT(*) FILTER (WHERE p.id IS NULL)::integer AS missing_profile_accounts
FROM public.agent_profiles ap
LEFT JOIN public.profiles p ON p.id = ap.user_id;

WITH profile_metrics AS (
  SELECT ap.id AS profile_id,
         ap.user_id,
         ap.status,
         NULLIF(btrim(ap.display_name), '') IS NOT NULL AS has_display_name,
         NULLIF(btrim(ap.bio), '') IS NOT NULL AS has_bio,
         NULLIF(btrim(ap.avatar_url), '') IS NOT NULL AS has_avatar,
         (NULLIF(btrim(ap.public_phone), '') IS NOT NULL OR NULLIF(btrim(ap.public_zalo), '') IS NOT NULL) AS has_contact,
         COUNT(DISTINCT ul.property_id) FILTER (
           WHERE ul.status = 'approved' AND pr.is_active = true
         )::integer AS approved_active_listings
  FROM public.agent_profiles ap
  LEFT JOIN public.user_listings ul ON ul.user_id = ap.user_id
  LEFT JOIN public.properties pr ON pr.id = ul.property_id
  GROUP BY ap.id, ap.user_id, ap.status, ap.display_name, ap.bio, ap.avatar_url, ap.public_phone, ap.public_zalo
)
SELECT 'profile_completeness' AS section,
       COUNT(*)::integer AS total_profiles,
       COUNT(*) FILTER (WHERE has_display_name AND has_bio AND has_avatar AND has_contact AND approved_active_listings > 0)::integer AS complete_profiles,
       COUNT(*) FILTER (WHERE NOT has_display_name)::integer AS missing_display_name,
       COUNT(*) FILTER (WHERE NOT has_bio)::integer AS missing_bio,
       COUNT(*) FILTER (WHERE NOT has_avatar)::integer AS missing_avatar,
       COUNT(*) FILTER (WHERE NOT has_contact)::integer AS missing_contact,
       COUNT(*) FILTER (WHERE approved_active_listings = 0)::integer AS missing_approved_active_listing
FROM profile_metrics;

SELECT 'owner_listing_mapping' AS section,
       COUNT(*)::integer AS total_user_listing_rows,
       COUNT(*) FILTER (WHERE user_id IS NULL)::integer AS rows_without_owner,
       COUNT(*) FILTER (WHERE property_id IS NULL)::integer AS rows_without_property_link,
       COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::integer AS distinct_owners,
       COUNT(DISTINCT property_id) FILTER (WHERE property_id IS NOT NULL)::integer AS distinct_linked_properties
FROM public.user_listings;

SELECT 'approved_active_listing_metrics' AS section,
       COUNT(*)::integer AS approved_active_listings,
       COUNT(DISTINCT ul.user_id)::integer AS owners_with_approved_active_listings,
       COUNT(DISTINCT ul.property_id)::integer AS linked_active_properties
FROM public.user_listings ul
JOIN public.properties pr ON pr.id = ul.property_id
WHERE ul.status = 'approved' AND pr.is_active = true;

SELECT 'listing_derived_lead_metrics' AS section,
       COUNT(DISTINCT l.id)::integer AS leads_on_approved_active_owner_listings,
       COUNT(DISTINCT ul.user_id)::integer AS owners_with_listing_leads
FROM public.user_listings ul
JOIN public.properties pr ON pr.id = ul.property_id AND pr.is_active = true
JOIN public.leads l ON l.property_id = pr.id
WHERE ul.status = 'approved';

SELECT 'audit_baseline' AS section,
       to_regclass('public.agent_profile_audit_events') AS audit_table;

SELECT 'workspace_function_baseline' AS section,
       to_regprocedure('public.get_agent_profile_directory(text,text,integer,integer)') AS directory_function,
       to_regprocedure('public.update_agent_profile(uuid,jsonb)') AS update_function,
       to_regprocedure('public.get_agent_profile_audit(uuid)') AS audit_function;

SELECT 'profile_policies' AS section,
       policyname,
       cmd,
       roles::text[] AS roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'agent_profiles'
ORDER BY policyname;

SELECT 'profile_function_acl' AS section,
       p.oid::regprocedure AS function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_agent_profile_directory', 'update_agent_profile', 'get_agent_profile_audit', 'public_get_agent_profile')
ORDER BY p.proname, p.oid::regprocedure::text;
