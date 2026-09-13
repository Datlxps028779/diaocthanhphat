-- Secure server boundary for one-off News slug corrections.
--
-- The SQL Editor runs with auth.uid() = NULL, so direct UPDATE statements are
-- correctly rejected by the staff-scope trigger. This migration adds a narrow,
-- service-role-only RPC used by an owner-MFA Next.js route. It does not weaken
-- browser/staff permissions and does not change publication state.
--
-- The RPC is intentionally separate from the publication boundary. It changes
-- only slug/updated_at, and the application route performs cache revalidation
-- without invoking publicIndexing, AI, or RAG.
--
-- Production SQL is run by the user after review.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_staff_content_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_neighborhood_id uuid;
  v_module text;
  v_area_id uuid;
  v_district_id uuid;
  v_ward_id uuid;
  v_is_published boolean;
BEGIN
  -- Narrow bypass for the service-role-only slug correction RPC. The RPC
  -- authenticates the actor, validates the exact old/new slug and uniqueness,
  -- then sets this transaction-local flag immediately before UPDATE.
  IF TG_TABLE_NAME = 'news'
     AND TG_OP = 'UPDATE'
     AND current_setting('app.news_slug_correction_boundary', true) = 'allowed'
     AND coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Existing narrow bypass for the service-role-only publication RPC.
  IF current_setting('app.news_publication_boundary', true) = 'allowed'
     AND coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  v_module := TG_ARGV[0];
  IF TG_TABLE_NAME = 'properties' THEN
    v_area_id := NEW.area_id;
    v_district_id := NEW.district_id;
    v_ward_id := NEW.ward_id;
    SELECT n.id INTO v_neighborhood_id
    FROM public.neighborhoods AS n
    WHERE n.slug = NEW.neighborhood_slug
    LIMIT 1;
    v_is_published := NEW.is_active;
  ELSE
    v_area_id := NEW.area_id;
    v_district_id := NEW.district_id;
    v_ward_id := NEW.ward_id;
    v_neighborhood_id := NEW.neighborhood_id;
    v_is_published := NEW.is_published;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.has_staff_permission(v_module, 'create', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền tạo dữ liệu trong phạm vi này' USING ERRCODE = '42501';
    END IF;
    IF v_is_published AND NOT public.has_staff_permission(v_module, 'publish', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền đăng/xuất bản trong phạm vi này' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT public.has_staff_permission(v_module, 'edit', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền chỉnh sửa trong phạm vi này' USING ERRCODE = '42501';
    END IF;
    IF TG_TABLE_NAME = 'properties'
       AND v_is_published IS DISTINCT FROM (to_jsonb(OLD)->>'is_active')::boolean
       AND v_is_published
       AND NOT public.has_staff_permission(v_module, 'publish', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền đăng/xuất bản trong phạm vi này' USING ERRCODE = '42501';
    END IF;
    IF TG_TABLE_NAME = 'news'
       AND v_is_published IS DISTINCT FROM (to_jsonb(OLD)->>'is_published')::boolean
       AND v_is_published
       AND NOT public.has_staff_permission(v_module, 'publish', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền đăng/xuất bản trong phạm vi này' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_news_slug_server(
  p_news_id uuid,
  p_expected_old_slug text,
  p_new_slug text,
  p_actor_id uuid
)
RETURNS TABLE (
  id uuid,
  title text,
  old_slug text,
  slug text,
  category text,
  is_published boolean,
  published_at timestamptz,
  content_version bigint,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_news public.news%ROWTYPE;
  normalized_old_slug text := btrim(coalesce(p_expected_old_slug, ''));
  normalized_new_slug text := btrim(coalesce(p_new_slug, ''));
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'News slug correction chỉ được gọi từ server boundary'
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.owner_access_config
    WHERE singleton AND owner_user_id = p_actor_id
  ) THEN
    RAISE EXCEPTION 'Actor slug correction không hợp lệ'
      USING ERRCODE = '42501';
  END IF;

  IF p_news_id IS NULL
     OR normalized_old_slug = ''
     OR normalized_new_slug = ''
     OR normalized_new_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     OR normalized_old_slug = normalized_new_slug THEN
    RAISE EXCEPTION 'Slug correction payload không hợp lệ'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_news
  FROM public.news
  WHERE news.id = p_news_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bài viết'
      USING ERRCODE = 'P0002';
  END IF;

  IF current_news.is_published IS DISTINCT FROM true
     OR current_news.slug IS DISTINCT FROM normalized_old_slug THEN
    RAISE EXCEPTION 'Slug correction guard không khớp trạng thái source hiện tại'
      USING ERRCODE = '40001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.news AS other_news
    WHERE other_news.slug = normalized_new_slug
      AND other_news.id <> current_news.id
  ) THEN
    RAISE EXCEPTION 'Slug mới đã được bài viết khác sử dụng'
      USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('app.news_slug_correction_boundary', 'allowed', true);

  UPDATE public.news
  SET slug = normalized_new_slug,
      updated_at = now()
  WHERE news.id = current_news.id;

  RETURN QUERY
  SELECT current_news.id,
    current_news.title,
    current_news.slug,
    updated_news.slug,
    updated_news.category,
    updated_news.is_published,
    updated_news.published_at,
    updated_news.content_version,
    updated_news.updated_at
  FROM public.news AS updated_news
  WHERE updated_news.id = current_news.id;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_news_slug_server(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correct_news_slug_server(uuid, text, text, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.enforce_staff_content_permission()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
