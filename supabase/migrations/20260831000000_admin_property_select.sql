-- Allow the owner-MFA Admin catalogue to search both visible and hidden properties.
-- The public policy intentionally remains active-only for anon/authenticated users.
BEGIN;

DROP POLICY IF EXISTS "admin_select_properties" ON public.properties;
CREATE POLICY "admin_select_properties" ON public.properties
  FOR SELECT TO authenticated
  USING (public.is_admin());

COMMIT;
