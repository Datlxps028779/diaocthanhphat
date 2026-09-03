-- Read-only preflight for owner-scoped listing CRM.
-- Run before the migration; zero-row checks are expected for clean data.

SELECT 'leads_without_listing_owner_mapping' AS check_name, COUNT(*) AS row_count
FROM public.leads l
WHERE l.property_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_listings ul
    WHERE ul.property_id = l.property_id
  );

SELECT property_id, COUNT(*) AS approved_listing_count
FROM public.user_listings
WHERE property_id IS NOT NULL
  AND status = 'approved'
GROUP BY property_id
HAVING COUNT(*) > 1
ORDER BY approved_listing_count DESC, property_id;

SELECT 'owner_listing_crm_leads_function' AS check_name,
       to_regprocedure('public.get_my_listing_leads(uuid,text,text,integer,integer)') IS NOT NULL AS function_exists;

SELECT 'owner_listing_crm_stats_function' AS check_name,
       to_regprocedure('public.get_my_listing_lead_stats()') IS NOT NULL AS function_exists;

SELECT 'authenticated_direct_leads_select' AS check_name,
       has_table_privilege('authenticated', 'public.leads', 'SELECT') AS has_privilege;

SELECT 'authenticated_direct_phone_event_select' AS check_name,
       has_table_privilege('authenticated', 'public.property_phone_reveal_events', 'SELECT') AS has_privilege;

SELECT 'authenticated_lead_rpc_execute' AS check_name,
       has_function_privilege(
         'authenticated',
         'public.get_my_listing_leads(uuid,text,text,integer,integer)',
         'EXECUTE'
       ) AS has_privilege;

SELECT 'authenticated_stats_rpc_execute' AS check_name,
       has_function_privilege(
         'authenticated',
         'public.get_my_listing_lead_stats()',
         'EXECUTE'
       ) AS has_privilege;
