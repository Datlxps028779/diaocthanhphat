CREATE OR REPLACE FUNCTION public.set_news_publication_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.is_published
     AND (TG_OP = 'INSERT' OR OLD.is_published IS DISTINCT FROM NEW.is_published)
     AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_news_publication_timestamp ON public.news;

CREATE TRIGGER trg_set_news_publication_timestamp
  BEFORE INSERT OR UPDATE OF is_published ON public.news
  FOR EACH ROW
  EXECUTE FUNCTION public.set_news_publication_timestamp();

REVOKE ALL ON FUNCTION public.set_news_publication_timestamp() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.set_news_publication_timestamp() IS
  'Assigns publication time only when a news row is first inserted or transitions to public without an explicit timestamp.';
