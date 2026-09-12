-- Fix the deployed News publication RPC's PL/pgSQL variable/column ambiguity.
--
-- The RPC returns a column named `id`. Its actor guard previously used the
-- unqualified `id` column from profiles, which PostgreSQL resolves as
-- ambiguous (42702) inside PL/pgSQL. This follow-up keeps the public contract
-- and permissions unchanged, but aliases every relation used by the RPC.
--
-- Production: user runs this migration after reviewing it. Do not apply from
-- the application runtime.

BEGIN;

CREATE OR REPLACE FUNCTION public.publish_news_article_server(
  p_news_id uuid,
  p_expected_content_version bigint,
  p_publish boolean,
  p_actor_id uuid,
  p_quality_report jsonb DEFAULT NULL,
  p_affected_paths jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  id uuid,
  slug text,
  category text,
  is_published boolean,
  published_at timestamptz,
  content_version bigint,
  event_id uuid,
  changed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_news public.news%ROWTYPE;
  created_event uuid;
  next_published_at timestamptz;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Publication RPC chỉ được gọi từ server boundary'
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = p_actor_id AND profile.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Actor publication không hợp lệ'
      USING ERRCODE = '42501';
  END IF;

  IF p_news_id IS NULL OR p_expected_content_version IS NULL THEN
    RAISE EXCEPTION 'Thiếu news id hoặc content version'
      USING ERRCODE = '22023';
  END IF;

  SELECT n.* INTO current_news
  FROM public.news AS n
  WHERE n.id = p_news_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bài viết'
      USING ERRCODE = 'P0002';
  END IF;

  IF current_news.content_version <> p_expected_content_version THEN
    RAISE EXCEPTION 'Bài viết đã thay đổi, vui lòng tải lại trước khi xuất bản'
      USING ERRCODE = '40001';
  END IF;

  IF p_publish AND (
    jsonb_typeof(p_quality_report) IS DISTINCT FROM 'object'
    OR coalesce(p_quality_report ->> 'passed', 'false') <> 'true'
  ) THEN
    RAISE EXCEPTION 'Quality gate chưa đạt'
      USING ERRCODE = '23514';
  END IF;

  IF p_publish AND NOT public.news_has_publication_citations(current_news.citations) THEN
    RAISE EXCEPTION 'Cần tối thiểu hai nguồn tham khảo HTTP(S) hợp lệ, không trùng URL trước khi đăng công khai'
      USING ERRCODE = '23514';
  END IF;

  IF current_news.is_published = p_publish THEN
    RETURN QUERY SELECT current_news.id, current_news.slug, current_news.category,
      current_news.is_published, current_news.published_at, current_news.content_version,
      NULL::uuid, false;
    RETURN;
  END IF;

  next_published_at := CASE
    WHEN p_publish THEN coalesce(current_news.published_at, now())
    ELSE current_news.published_at
  END;

  PERFORM set_config('app.news_publication_boundary', 'allowed', true);
  UPDATE public.news AS n
  SET is_published = p_publish,
      published_at = next_published_at,
      updated_at = now()
  WHERE n.id = current_news.id;

  created_event := gen_random_uuid();
  INSERT INTO public.news_publication_events (
    event_id, news_id, actor_id, action, previous_is_published,
    next_is_published, content_version, quality_report, affected_paths
  ) VALUES (
    created_event, current_news.id, p_actor_id,
    CASE WHEN p_publish THEN 'publish' ELSE 'unpublish' END,
    current_news.is_published, p_publish, current_news.content_version,
    p_quality_report, CASE WHEN jsonb_typeof(p_affected_paths) = 'array'
      THEN p_affected_paths ELSE '[]'::jsonb END
  );

  RETURN QUERY SELECT current_news.id, current_news.slug, current_news.category,
    p_publish, next_published_at, current_news.content_version,
    created_event, true;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_news_article(uuid, bigint, boolean, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.publish_news_article_server(uuid, bigint, boolean, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_news_article_server(uuid, bigint, boolean, uuid, jsonb, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
