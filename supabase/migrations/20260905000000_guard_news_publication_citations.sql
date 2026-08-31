-- P8 source-first editorial quality: only gate future publication transitions.
-- This migration intentionally does not update or re-evaluate articles already public.

CREATE OR REPLACE FUNCTION public.news_has_publication_citations(p_citations jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH source_rows AS (
    SELECT
      item,
      nullif(btrim(item ->> 'title'), '') AS title,
      nullif(btrim(item ->> 'url'), '') AS url
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_citations) = 'array' THEN p_citations ELSE '[]'::jsonb END
    ) AS entry(item)
  ), valid_rows AS (
    SELECT title, url
    FROM source_rows
    WHERE jsonb_typeof(item) = 'object'
      AND title IS NOT NULL
      AND url ~* '^https?://[^[:space:]]+$'
      AND split_part(split_part(split_part(substring(url from 9), '/', 1), '?', 1), '#', 1) <> ''
  )
  SELECT jsonb_typeof(p_citations) = 'array'
    AND count(*) >= 2
    AND count(*) = (SELECT count(*) FROM source_rows)
    AND count(DISTINCT lower(url)) = count(*)
  FROM valid_rows;
$$;

CREATE OR REPLACE FUNCTION public.guard_news_publication_citations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_published
     AND (TG_OP = 'INSERT' OR OLD.is_published IS DISTINCT FROM NEW.is_published)
     AND NOT public.news_has_publication_citations(NEW.citations) THEN
    RAISE EXCEPTION 'Cần tối thiểu hai nguồn tham khảo HTTP(S) hợp lệ, không trùng URL trước khi đăng công khai'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_news_publication_citations ON public.news;
CREATE TRIGGER trg_guard_news_publication_citations
  BEFORE INSERT OR UPDATE OF is_published ON public.news
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_news_publication_citations();

REVOKE ALL ON FUNCTION public.news_has_publication_citations(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_news_publication_citations() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
