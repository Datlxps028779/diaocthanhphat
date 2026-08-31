-- P14 follow-up: make direct table access explicit and fail closed.
-- Public clients must use public_get_property_agent(), which returns only public fields.

REVOKE ALL ON TABLE public.agent_profiles FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
