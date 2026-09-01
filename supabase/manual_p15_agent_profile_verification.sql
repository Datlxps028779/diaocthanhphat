-- P15: read-only production verification. Run as one statement in Supabase SQL Editor.

WITH function_inventory AS (
  SELECT
    p.oid::regprocedure::text AS signature,
    p.prosecdef AS security_definer,
    p.proconfig AS config,
    array_agg(DISTINCT rp.grantee ORDER BY rp.grantee)
      FILTER (WHERE rp.privilege_type = 'EXECUTE') AS execute_grantees
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN information_schema.routine_privileges rp
    ON rp.specific_schema = n.nspname
   AND rp.routine_name = p.proname
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'public_get_agent_profile',
      'public_get_agent_profile_listings',
      'public_list_indexable_agent_profiles'
    )
  GROUP BY p.oid
),
table_privilege_inventory AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.grantee, x.privilege_type), '[]'::jsonb) AS privileges
  FROM (
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = 'agent_profiles'
  ) x
),
indexable_profiles AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.slug), '[]'::jsonb) AS profiles
  FROM (
    SELECT * FROM public.public_list_indexable_agent_profiles()
  ) x
)
SELECT jsonb_build_object(
  'functions', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.signature) FROM function_inventory f), '[]'::jsonb),
  'agent_profiles_rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.agent_profiles'::regclass),
  'agent_profiles_table_privileges', (SELECT privileges FROM table_privilege_inventory),
  'indexable_profiles', (SELECT profiles FROM indexable_profiles)
) AS p15_verification;
