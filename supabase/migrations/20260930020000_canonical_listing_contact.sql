-- Canonical identity/contact enforcement for user listings.
-- New writes fail closed when the owner profile lacks a valid name or phone.

ALTER TABLE public.user_listings ADD COLUMN IF NOT EXISTS contact_zalo text;

CREATE OR REPLACE FUNCTION public.normalize_vn_phone(p_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT CASE
    WHEN left(regexp_replace(p_input, '[^0-9]', '', 'g'), 2) = '84'
         AND length(regexp_replace(p_input, '[^0-9]', '', 'g')) >= 11
      THEN '0' || substr(regexp_replace(p_input, '[^0-9]', '', 'g'), 3)
    ELSE regexp_replace(p_input, '[^0-9]', '', 'g')
  END
$$;

CREATE OR REPLACE FUNCTION public.is_valid_vn_phone(p_input text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT public.normalize_vn_phone(p_input) ~ '^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$'
$$;

REVOKE ALL ON FUNCTION public.normalize_vn_phone(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_valid_vn_phone(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_profile_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.display_name := NULLIF(btrim(NEW.display_name), '');
  NEW.phone := NULLIF(public.normalize_vn_phone(NEW.phone), '');

  IF NEW.display_name IS NULL THEN
    RAISE EXCEPTION 'Họ tên là bắt buộc' USING ERRCODE = '23514';
  END IF;
  IF NEW.phone IS NULL OR NOT public.is_valid_vn_phone(NEW.phone) THEN
    RAISE EXCEPTION 'Số điện thoại Việt Nam không hợp lệ' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_enforce_profile_identity ON public.profiles;
CREATE TRIGGER trg_enforce_profile_identity
  BEFORE INSERT OR UPDATE OF display_name, phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_identity();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_display_name text := NULLIF(btrim(NEW.raw_user_meta_data->>'display_name'), '');
  v_phone text := NULLIF(public.normalize_vn_phone(NEW.raw_user_meta_data->>'phone'), '');
BEGIN
  IF v_display_name IS NULL THEN
    RAISE EXCEPTION 'Họ tên là bắt buộc' USING ERRCODE = '23514';
  END IF;
  IF v_phone IS NULL OR NOT public.is_valid_vn_phone(v_phone) THEN
    RAISE EXCEPTION 'Số điện thoại Việt Nam không hợp lệ' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.profiles (id, display_name, phone)
  VALUES (NEW.id, v_display_name, v_phone)
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        phone = EXCLUDED.phone,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.canonicalize_user_listing_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_display_name text;
  v_phone text;
BEGIN
  SELECT NULLIF(btrim(p.display_name), ''), NULLIF(public.normalize_vn_phone(p.phone), '')
    INTO v_display_name, v_phone
    FROM public.profiles p
   WHERE p.id = NEW.user_id;

  IF v_display_name IS NULL OR v_phone IS NULL OR NOT public.is_valid_vn_phone(v_phone) THEN
    RAISE EXCEPTION 'Tài khoản cần họ tên và số điện thoại hợp lệ trước khi đăng tin'
      USING ERRCODE = '23514';
  END IF;

  NEW.contact_name := v_display_name;
  NEW.contact_phone := v_phone;
  NEW.contact_zalo := v_phone;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.canonicalize_user_listing_contact() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_canonicalize_user_listing_contact ON public.user_listings;
CREATE TRIGGER trg_canonicalize_user_listing_contact
  BEFORE INSERT OR UPDATE ON public.user_listings
  FOR EACH ROW EXECUTE FUNCTION public.canonicalize_user_listing_contact();

CREATE OR REPLACE FUNCTION public.sync_user_listing_contact(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exists boolean;
BEGIN
  UPDATE public.user_listings
     SET contact_name = contact_name,
         contact_phone = contact_phone,
         contact_zalo = contact_zalo
   WHERE id = p_listing_id
   RETURNING true INTO v_exists;
  IF NOT COALESCE(v_exists, false) THEN
    RAISE EXCEPTION 'Không tìm thấy tin đăng' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_listing_contact(uuid) FROM PUBLIC, anon, authenticated;

-- The public wrapper is the only callable approval boundary after the admin-only
-- moderation migration. Sync the owner identity before the legacy transaction
-- copies listing data into properties.
CREATE OR REPLACE FUNCTION public.approve_user_listing(p_listing_id uuid)
RETURNS TABLE (
  property_id uuid,
  title text,
  description text,
  city text,
  district text,
  listing_type text,
  price numeric,
  price_unit text,
  area_sqm numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Không có quyền duyệt tin đăng' USING ERRCODE = '42501';
  END IF;
  PERFORM public.sync_user_listing_contact(p_listing_id);
  RETURN QUERY SELECT * FROM public.approve_user_listing_legacy(p_listing_id);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_user_listing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_user_listing(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
