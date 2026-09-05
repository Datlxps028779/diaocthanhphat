-- Read-only audit for legacy public news rows missing an editorial publication timestamp.
SELECT
  id,
  title,
  created_at,
  updated_at
FROM public.news
WHERE is_published = true
  AND published_at IS NULL
ORDER BY created_at DESC, id DESC;

SELECT count(*) AS public_news_missing_published_at
FROM public.news
WHERE is_published = true
  AND published_at IS NULL;
