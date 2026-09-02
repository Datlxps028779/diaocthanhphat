-- P12/P17 read-only verification for user/customer identity and listing scope.
-- Run after 20260920000000_user_customer_identity_links.sql and
-- 20260921000000_user_customer_listing_scope.sql. This script does not mutate data.

BEGIN TRANSACTION READ ONLY;

WITH checks AS (
  SELECT
    to_regprocedure('public.is_user_customer_account(uuid)') IS NOT NULL AS has_customer_role_helper,
    to_regprocedure('public.get_customer_linked_leads(uuid)') IS NOT NULL AS has_linked_leads_projection,
    to_regprocedure('public.get_customer_linked_chats(uuid)') IS NOT NULL AS has_linked_chats_projection,
    to_regprocedure('public.admin_link_customer_lead(uuid,uuid)') IS NOT NULL AS has_admin_lead_link,
    to_regprocedure('public.admin_link_customer_chat(uuid,uuid)') IS NOT NULL AS has_admin_chat_link,
    to_regprocedure('public.admin_update_lead_crm(uuid,jsonb)') IS NOT NULL AS has_lead_crm_update,
    to_regprocedure('public.admin_bulk_update_lead_status(uuid[],text)') IS NOT NULL AS has_bulk_lead_update,
    to_regprocedure('public.assert_user_listing_mutation_scope()') IS NOT NULL AS has_listing_scope_trigger_fn,
    EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = 'public.user_listings'::regclass
        AND tgname = 'trg_user_listing_mutation_scope'
        AND NOT tgisinternal
    ) AS has_listing_scope_trigger,
    has_function_privilege('authenticated', 'public.admin_link_customer_lead(uuid,uuid)', 'EXECUTE') AS auth_can_link_lead,
    has_function_privilege('anon', 'public.admin_link_customer_lead(uuid,uuid)', 'EXECUTE') AS anon_can_link_lead,
    has_function_privilege('authenticated', 'public.get_customer_linked_leads(uuid)', 'EXECUTE') AS auth_can_read_linked_leads,
    has_function_privilege('anon', 'public.get_customer_linked_leads(uuid)', 'EXECUTE') AS anon_can_read_linked_leads
),
roles AS (
  SELECT
    count(*) FILTER (WHERE p.role = 'user') AS user_profiles,
    count(*) FILTER (WHERE p.role <> 'user') AS non_user_profiles,
    count(c.user_id) AS customer_records,
    count(c.user_id) FILTER (WHERE p.id IS NULL) AS customer_records_without_profile,
    count(c.user_id) FILTER (WHERE p.role <> 'user') AS customer_records_for_non_users
  FROM public.user_customer_records c
  LEFT JOIN public.profiles p ON p.id = c.user_id
),
links AS (
  SELECT
    (SELECT count(*) FROM public.leads WHERE user_id IS NOT NULL) AS linked_leads,
    (SELECT count(*) FROM public.chat_sessions WHERE user_id IS NOT NULL) AS linked_chats,
    (SELECT count(*) FROM public.leads l JOIN public.profiles p ON p.id = l.user_id WHERE l.user_id IS NOT NULL AND p.role <> 'user') AS linked_leads_to_non_users,
    (SELECT count(*) FROM public.chat_sessions c JOIN public.profiles p ON p.id = c.user_id WHERE c.user_id IS NOT NULL AND p.role <> 'user') AS linked_chats_to_non_users
),
assignments AS (
  SELECT
    count(*) FILTER (WHERE ended_at IS NULL) AS active_assignments,
    count(*) FILTER (WHERE ended_at IS NULL AND assignment_kind = 'primary') AS active_primary_assignments,
    count(*) FILTER (WHERE ended_at IS NULL AND assignment_kind = 'co_assignee') AS active_co_assignments,
    count(*) FILTER (WHERE ended_at IS NULL AND p.role <> 'staff') AS active_assignments_to_non_staff
  FROM public.user_customer_assignments a
  LEFT JOIN public.profiles p ON p.id = a.staff_user_id
)
SELECT jsonb_build_object(
  'rpc_and_grant_checks', (SELECT to_jsonb(checks) FROM checks),
  'customer_role_counts', (SELECT to_jsonb(roles) FROM roles),
  'explicit_identity_link_counts', (SELECT to_jsonb(links) FROM links),
  'assignment_integrity', (SELECT to_jsonb(assignments) FROM assignments)
) AS user_customer_identity_verification;

ROLLBACK;
