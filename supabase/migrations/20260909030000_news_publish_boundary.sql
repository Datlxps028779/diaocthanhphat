-- Unified News publication boundary.
-- Draft writes remain server-controlled; every future public-state transition must
-- pass the owner-MFA API boundary and emit one durable publication event.

BEGIN;

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS content_version bigint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.news'::regclass
      AND conname = 'news_content_version_positive'
  ) THEN
    ALTER TABLE public.news
      ADD CONSTRAINT news_content_version_positive CHECK (content_version > 0);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.news_publication_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id uuid NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('publish', 'unpublish', 'update')),
  previous_is_published boolean NOT NULL,
  next_is_published boolean NOT NULL,
  content_version bigint NOT NULL CHECK (content_version > 0),
  quality_report jsonb,
  affected_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_publication_events_news_idx
  ON public.news_publication_events (news_id, created_at DESC, event_id DESC);

ALTER TABLE public.news_publication_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.news_publication_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bump_news_content_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.content_version := OLD.content_version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_news_content_version ON public.news;
CREATE TRIGGER trg_news_content_version
  BEFORE UPDATE OF title, slug, excerpt, content, image_url, category, author,
    author_type, author_role, as_of_date, reviewer_name, reviewer_role, source_note,
    meta_title, meta_description, focus_keywords, related_ids, geo_area, geo_entity,
    geo_notes, area_id, district_id, ward_id, neighborhood_id, faq, citations
  ON public.news
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_news_content_version();

CREATE OR REPLACE FUNCTION public.guard_news_publication_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_published IS DISTINCT FROM COALESCE(OLD.is_published, false)
     AND coalesce(current_setting('app.news_publication_boundary', true), '') <> 'allowed' THEN
    RAISE EXCEPTION 'News publication phải đi qua server boundary'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_news_publication_boundary ON public.news;
CREATE TRIGGER trg_guard_news_publication_boundary
  BEFORE INSERT OR UPDATE OF is_published
  ON public.news
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_news_publication_boundary();

CREATE OR REPLACE FUNCTION public.publish_news_article(
  p_news_id uuid,
  p_expected_content_version bigint,
  p_publish boolean,
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
  IF auth.uid() IS NULL OR NOT public.is_owner_mfa() THEN
    RAISE EXCEPTION 'Chỉ owner MFA được phép xuất bản News'
      USING ERRCODE = '42501';
  END IF;

  IF p_news_id IS NULL OR p_expected_content_version IS NULL THEN
    RAISE EXCEPTION 'Thiếu news id hoặc content version'
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
  UPDATE public.news
  SET is_published = p_publish,
      published_at = next_published_at,
      updated_at = now()
  WHERE news.id = current_news.id;

  created_event := gen_random_uuid();
  INSERT INTO public.news_publication_events (
    event_id, news_id, actor_id, action, previous_is_published,
    next_is_published, content_version, quality_report, affected_paths
  ) VALUES (
    created_event, current_news.id, auth.uid(),
    CASE WHEN p_publish THEN 'publish' ELSE 'unpublish' END,
    current_news.is_published, p_publish, current_news.content_version,
    p_quality_report, p_affected_paths
  );

  RETURN QUERY SELECT current_news.id, current_news.slug, current_news.category,
    p_publish, next_published_at, current_news.content_version,
    created_event, true;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_news_content_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_news_publication_boundary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_news_article(uuid, bigint, boolean, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_news_article(uuid, bigint, boolean, jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
