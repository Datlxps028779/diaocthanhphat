-- Allow the user-run canonical contact backfill through the existing mutation guard.
-- The bypass requires both a system SQL session and an explicit transaction-local flag.
-- It does not grant any function privilege or change authenticated client behavior.

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

  IF auth.uid() IS NULL
     AND session_user IN ('postgres', 'supabase_admin')
     AND current_setting('app.canonical_contact_backfill', true) = 'true'
  THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.user_id OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Chỉ chủ tài khoản hoặc admin được sửa tin đăng' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_user_listing_mutation_scope() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
