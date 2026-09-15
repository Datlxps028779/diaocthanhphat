-- Public property privacy boundary.
-- Run this migration in Supabase production only after verifying public_properties readers.
-- No property rows are changed.

BEGIN;

REVOKE SELECT ON TABLE public.properties FROM anon;
REVOKE SELECT (contact_name, contact_phone, contact_zalo)
  ON TABLE public.properties
  FROM anon;

GRANT SELECT ON public.public_properties TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
