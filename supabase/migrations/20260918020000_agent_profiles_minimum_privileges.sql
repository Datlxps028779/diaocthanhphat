-- P14 follow-up: restrict authenticated direct table privileges to the CRUD
-- operations needed by owner-scoped RLS policies. Public clients use the lookup RPC.

REVOKE ALL ON TABLE public.agent_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
