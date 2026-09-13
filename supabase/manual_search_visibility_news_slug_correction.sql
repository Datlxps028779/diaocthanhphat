-- =============================================================================
-- News slug correction — guarded production update
--
-- This is the first mutation step for exactly one known published news row.
-- Production SQL is run by the user. The guards abort unless the row still has
-- the expected ID, published state, and old malformed slug, and unless the new
-- slug remains unique.
--
-- It changes only public.news.slug and public.news.updated_at. It does not
-- change is_published or published_at. The existing content_version trigger
-- may increment content_version because slug is an editorial content field.
-- After this succeeds, revalidation and Search Visibility registry sync must be
-- run as separate controlled steps.
--
-- This SQL does not call Google, AI, or RAG.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_news_id uuid := 'f551d52c-3927-4d02-83a0-8cdb5996d365';
  v_old_slug text := 'luat-kinh-doanh-bat-dong-san-moi-nhat-nam-2026-nhung-thay-doi-quan-trong-va-tac-dong-den-thi-truong-';
  v_new_slug text := 'luat-kinh-doanh-bat-dong-san-moi-nhat-nam-2026-nhung-thay-doi-quan-trong-va-tac-dong-den-thi-truong';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.news
    WHERE id = v_news_id
      AND is_published IS TRUE
      AND slug = v_old_slug
  ) THEN
    RAISE EXCEPTION 'Guard failed: news row, published state, or expected old slug no longer matches.'
      USING ERRCODE = '40001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.news
    WHERE slug = v_new_slug
      AND id <> v_news_id
  ) THEN
    RAISE EXCEPTION 'Guard failed: proposed slug is already used by another news row.'
      USING ERRCODE = '23505';
  END IF;

  UPDATE public.news
  SET slug = v_new_slug,
      updated_at = now()
  WHERE id = v_news_id
    AND is_published IS TRUE
    AND slug = v_old_slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guard failed: guarded update affected no row.'
      USING ERRCODE = '40001';
  END IF;
END;
$$;

SELECT jsonb_build_object(
  'updated_at', now(),
  'id', n.id,
  'title', n.title,
  'slug', n.slug,
  'is_published', n.is_published,
  'published_at', n.published_at,
  'content_version', n.content_version,
  'updated_row', true
) AS news_slug_correction_result
FROM public.news AS n
WHERE n.id = 'f551d52c-3927-4d02-83a0-8cdb5996d365'::uuid;

COMMIT;
