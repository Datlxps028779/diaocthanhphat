-- Least-privilege hardening for public table roles.
-- Public lead writes and phone reveal remain SECURITY DEFINER RPC boundaries.

REVOKE ALL ON TABLE public.leads FROM anon;
REVOKE ALL ON TABLE public.user_listings FROM anon;
REVOKE ALL ON TABLE public.properties FROM anon;
GRANT SELECT ON TABLE public.properties TO anon;

REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
  ON TABLE public.leads, public.properties, public.user_listings
  FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
