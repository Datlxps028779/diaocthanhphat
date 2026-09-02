-- P12/P17: enforce customer assignment scope for every user listing mutation.
-- This protects legacy SECURITY DEFINER review RPCs as well as direct updates.

CREATE OR REPLACE FUNCTION public.assert_user_listing_mutation_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Không được thay đổi chủ sở hữu tin đăng' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_customer_member(OLD.user_id) THEN
    RAISE EXCEPTION 'Tin đăng ngoài phạm vi customer được phân công' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_user_listing_mutation_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_user_listing_mutation_scope ON public.user_listings;
CREATE TRIGGER trg_user_listing_mutation_scope
  BEFORE UPDATE ON public.user_listings
  FOR EACH ROW EXECUTE FUNCTION public.assert_user_listing_mutation_scope();

NOTIFY pgrst, 'reload schema';
