-- Read-only preflight for staff -> customer -> listing -> property lead scope.

SELECT
  a.staff_user_id,
  a.user_id AS customer_user_id,
  COUNT(DISTINCT ul.id) AS listing_count,
  COUNT(DISTINCT l.id) AS listing_lead_count
FROM public.user_customer_assignments a
LEFT JOIN public.user_listings ul
  ON ul.user_id = a.user_id
LEFT JOIN public.leads l
  ON l.property_id = ul.property_id
WHERE a.ended_at IS NULL
GROUP BY a.staff_user_id, a.user_id
ORDER BY a.staff_user_id, a.user_id;

SELECT
  l.id AS lead_id,
  l.property_id,
  l.user_id AS visitor_user_id
FROM public.leads l
WHERE l.property_id IS NOT NULL
  AND l.user_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_listings ul
    WHERE ul.property_id = l.property_id
  )
ORDER BY l.created_at DESC;

SELECT
  a.staff_user_id,
  a.user_id AS customer_user_id,
  COUNT(DISTINCT l.id) AS inherited_lead_count
FROM public.user_customer_assignments a
JOIN public.user_listings ul ON ul.user_id = a.user_id
JOIN public.leads l ON l.property_id = ul.property_id
WHERE a.ended_at IS NOT NULL
GROUP BY a.staff_user_id, a.user_id
ORDER BY a.staff_user_id, a.user_id;

SELECT to_regprocedure('public.is_customer_listing_lead_member(uuid)') AS helper_function;
SELECT to_regprocedure('public.get_customer_listing_leads(uuid,uuid,integer,integer)') AS projection_function;
SELECT to_regprocedure('public.admin_update_lead_crm(uuid,jsonb)') AS lead_update_function;
SELECT to_regprocedure('public.admin_bulk_update_lead_status(uuid[],text)') AS bulk_lead_update_function;

SELECT
  has_function_privilege(
    'authenticated',
    'public.is_customer_listing_lead_member(uuid)',
    'EXECUTE'
  ) AS authenticated_can_execute_helper,
  has_function_privilege(
    'anon',
    'public.is_customer_listing_lead_member(uuid)',
    'EXECUTE'
  ) AS anon_can_execute_helper,
  has_function_privilege(
    'authenticated',
    'public.get_customer_listing_leads(uuid,uuid,integer,integer)',
    'EXECUTE'
  ) AS authenticated_can_execute_projection,
  has_function_privilege(
    'anon',
    'public.get_customer_listing_leads(uuid,uuid,integer,integer)',
    'EXECUTE'
  ) AS anon_can_execute_projection;

SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('leads', 'lead_activities')
  AND policyname IN (
    'auth_select_leads',
    'auth_update_leads',
    'auth_select_lead_activities',
    'auth_insert_lead_activities'
  )
ORDER BY tablename, policyname;

SELECT
  tgname,
  tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.leads'::regclass
  AND tgname = 'trg_lead_crm_update_scope';

SELECT
  tgname,
  tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.user_listings'::regclass
  AND tgname = 'trg_user_listing_mutation_scope';

SELECT
  has_table_privilege('authenticated', 'public.leads', 'SELECT') AS authenticated_direct_leads_select,
  has_table_privilege('authenticated', 'public.lead_activities', 'SELECT') AS authenticated_direct_activities_select;
