-- P18: remove any legacy public INSERT policy that may have survived
-- manual migration ordering. Public lead writes use public_submit_lead only.

DROP POLICY IF EXISTS "public_insert_leads" ON public.leads;

DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'leads'
      AND cmd = 'INSERT'
      AND (
        'public' = ANY(roles)
        OR 'anon' = ANY(roles)
        OR 'authenticated' = ANY(roles)
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.leads', policy_row.policyname);
  END LOOP;
END;
$$;

REVOKE INSERT ON TABLE public.leads FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
