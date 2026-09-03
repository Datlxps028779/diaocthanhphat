SELECT
  to_regprocedure('public.public_submit_lead(uuid,text,text,text,text,uuid,text,text,timestamptz)') AS public_submit_lead,
  to_regprocedure('public.public_reveal_property_phone(uuid,text,text,text)') AS phone_reveal;

SELECT
  has_function_privilege(
    'anon',
    'public.public_submit_lead(uuid,text,text,text,text,uuid,text,text,timestamptz)',
    'EXECUTE'
  ) AS anon_can_submit,
  has_function_privilege(
    'authenticated',
    'public.public_submit_lead(uuid,text,text,text,text,uuid,text,text,timestamptz)',
    'EXECUTE'
  ) AS authenticated_can_submit,
  has_function_privilege(
    'anon',
    'public.public_reveal_property_phone(uuid,text,text,text)',
    'EXECUTE'
  ) AS anon_can_reveal,
  has_function_privilege(
    'authenticated',
    'public.public_reveal_property_phone(uuid,text,text,text)',
    'EXECUTE'
  ) AS authenticated_can_reveal;

SELECT
  has_table_privilege('anon', 'public.leads', 'INSERT') AS anon_can_insert_leads,
  has_table_privilege('authenticated', 'public.leads', 'INSERT') AS authenticated_can_insert_leads;

SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'leads'
ORDER BY policyname;

SELECT
  p.oid::regprocedure AS function_name,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config,
  EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p.proconfig, '{}'::text[])) AS config
    WHERE regexp_replace(config, '\s', '', 'g') = 'search_path=public,pg_temp'
  ) AS locked_search_path
FROM pg_proc p
WHERE p.oid IN (
  to_regprocedure('public.public_submit_lead(uuid,text,text,text,text,uuid,text,text,timestamptz)'),
  to_regprocedure('public.public_reveal_property_phone(uuid,text,text,text)')
);

SELECT
  to_regprocedure('public.public_submit_lead(uuid,text,text,text,text,uuid,text,text,timestamptz)') IS NOT NULL AS submit_exists,
  to_regprocedure('public.public_reveal_property_phone(uuid,text,text,text)') IS NOT NULL AS reveal_exists,
  has_function_privilege('anon', 'public.public_submit_lead(uuid,text,text,text,text,uuid,text,text,timestamptz)', 'EXECUTE') AS anon_can_submit,
  has_function_privilege('authenticated', 'public.public_submit_lead(uuid,text,text,text,text,uuid,text,text,timestamptz)', 'EXECUTE') AS authenticated_can_submit,
  has_function_privilege('anon', 'public.public_reveal_property_phone(uuid,text,text,text)', 'EXECUTE') AS anon_can_reveal,
  has_function_privilege('authenticated', 'public.public_reveal_property_phone(uuid,text,text,text)', 'EXECUTE') AS authenticated_can_reveal,
  has_table_privilege('anon', 'public.leads', 'INSERT') AS anon_can_insert_leads,
  has_table_privilege('authenticated', 'public.leads', 'INSERT') AS authenticated_can_insert_leads,
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'leads'
      AND cmd = 'INSERT'
      AND ('anon' = ANY(roles) OR 'authenticated' = ANY(roles))
  ) AS has_public_lead_insert_policy,
  (
    SELECT bool_and(
      p.prosecdef
      AND EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, '{}'::text[])) AS config
        WHERE regexp_replace(config, '\s', '', 'g') = 'search_path=public,pg_temp'
      )
    )
    FROM pg_proc p
    WHERE p.oid IN (
      to_regprocedure('public.public_submit_lead(uuid,text,text,text,text,uuid,text,text,timestamptz)'),
      to_regprocedure('public.public_reveal_property_phone(uuid,text,text,text)')
    )
  ) AS all_public_functions_hardened;
