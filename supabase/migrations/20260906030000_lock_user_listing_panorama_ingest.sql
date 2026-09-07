BEGIN;

-- Browser clients must not be able to forge server-derived metadata or replace
-- validated objects directly. Upload and replacement go through the server route.
REVOKE INSERT, UPDATE ON public.user_listing_panoramas FROM authenticated;

DROP POLICY IF EXISTS property_360_user_insert ON storage.objects;
DROP POLICY IF EXISTS property_360_user_update ON storage.objects;

ALTER FUNCTION public.attach_user_listing_panoramas(uuid, uuid, uuid[])
  SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_user_listing_panorama(
  p_panorama_id uuid,
  p_label text DEFAULT NULL,
  p_sort_order integer DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS SETOF public.user_listing_panoramas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_user_id uuid;
  v_listing_id uuid;
  v_listing_owner uuid;
  v_listing_status text;
  v_is_admin boolean := public.is_admin();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để cập nhật ảnh 360.' USING ERRCODE = '42501';
  END IF;
  IF p_sort_order IS NOT NULL AND p_sort_order < 0 THEN
    RAISE EXCEPTION 'Thứ tự ảnh 360 không hợp lệ.' USING ERRCODE = '22023';
  END IF;

  SELECT p.owner_user_id, p.user_listing_id
    INTO v_owner_user_id, v_listing_id
    FROM public.user_listing_panoramas p
   WHERE p.id = p_panorama_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ảnh 360.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_is_admin AND v_owner_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Bạn không có quyền cập nhật ảnh 360 này.' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_admin AND v_listing_id IS NOT NULL THEN
    SELECT l.user_id, l.status
      INTO v_listing_owner, v_listing_status
      FROM public.user_listings l
     WHERE l.id = v_listing_id;
    IF v_listing_owner <> auth.uid()
       OR v_listing_status NOT IN ('pending', 'rejected', 'expired') THEN
      RAISE EXCEPTION 'Tin đăng hiện không thể chỉnh sửa ảnh 360.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_label IS NOT NULL AND char_length(regexp_replace(trim(p_label), '\\s+', ' ', 'g')) > 120 THEN
    RAISE EXCEPTION 'Nhãn ảnh 360 tối đa 120 ký tự.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.user_listing_panoramas p
     SET label = CASE
                   WHEN p_label IS NULL THEN p.label
                   ELSE regexp_replace(trim(p_label), '\\s+', ' ', 'g')
                 END,
         sort_order = COALESCE(p_sort_order, p.sort_order),
         is_active = COALESCE(p_is_active, p.is_active),
         updated_at = now()
   WHERE p.id = p_panorama_id;

  RETURN QUERY SELECT p.*
    FROM public.user_listing_panoramas p
   WHERE p.id = p_panorama_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_listing_panorama(uuid, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user_listing_panorama(uuid, text, integer, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
