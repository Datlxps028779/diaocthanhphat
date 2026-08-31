-- P14: read-only verification after the user runs the migration in production.
-- Run the whole script in Supabase SQL Editor. It returns one JSON row.

WITH function_inventory AS (
  SELECT
    p.oid::regprocedure::text AS signature,
    p.prosecdef AS security_definer,
    p.proconfig AS config,
    array_agg(DISTINCT rp.grantee ORDER BY rp.grantee) FILTER (WHERE rp.privilege_type = 'EXECUTE') AS execute_grantees
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN information_schema.routine_privileges rp
    ON rp.specific_schema = n.nspname
   AND rp.routine_name = p.proname
  WHERE n.nspname = 'public'
    AND p.proname IN ('save_my_agent_profile', 'save_my_profile_and_agent_profile', 'public_get_property_agent')
  GROUP BY p.oid
),
policy_inventory AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.policyname), '[]'::jsonb) AS policies
  FROM (
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_profiles'
  ) x
),
agent_inventory AS (
  SELECT
    COUNT(*) AS agent_profile_rows,
    COUNT(*) FILTER (WHERE status = 'draft') AS draft_rows,
    COUNT(*) FILTER (WHERE status = 'published') AS published_rows,
    COUNT(*) FILTER (WHERE status = 'disabled') AS disabled_rows,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(display_name), '') IS NULL) AS invalid_names,
    COUNT(*) FILTER (WHERE user_id IS NULL) AS orphan_agent_profiles
  FROM public.agent_profiles
),
approved_mapping AS (
  SELECT
    COUNT(*) AS approved_user_listing_links,
    COUNT(ap.id) AS links_with_published_agent,
    COUNT(*) FILTER (WHERE ap.id IS NOT NULL AND pr.is_active) AS published_agents_on_active_properties,
    COUNT(*) FILTER (WHERE ap.id IS NOT NULL AND NOT pr.is_active) AS published_agents_on_inactive_properties
  FROM public.user_listings ul
  JOIN public.properties pr ON pr.id = ul.property_id
  LEFT JOIN public.agent_profiles ap ON ap.user_id = ul.user_id AND ap.status = 'published'
  WHERE ul.status = 'approved' AND ul.property_id IS NOT NULL
),
column_inventory AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.ordinal_position), '[]'::jsonb) AS columns
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'agent_profiles'
),
table_privilege_inventory AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.grantee, x.privilege_type), '[]'::jsonb) AS privileges
  FROM (
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = 'agent_profiles'
  ) x
)
SELECT jsonb_build_object(
  'table_exists', to_regclass('public.agent_profiles') IS NOT NULL,
  'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.agent_profiles'::regclass),
  'columns', (SELECT columns FROM column_inventory),
  'table_privileges', (SELECT privileges FROM table_privilege_inventory),
  'functions', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.signature) FROM function_inventory f), '[]'::jsonb),
  'policies', (SELECT policies FROM policy_inventory),
  'agent_inventory', (SELECT to_jsonb(a) FROM agent_inventory a),
  'approved_mapping', (SELECT to_jsonb(a) FROM approved_mapping a)
) AS p14_verification;
