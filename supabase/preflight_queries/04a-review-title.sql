-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

WITH title_candidates AS (
  SELECT 'properties'::text AS source, p.id, p.is_active AS public_active,
         p.title AS current_value,
         NULL::text AS proposed_value,
         p.slug,
         CASE
           WHEN p.title IS NULL OR btrim(p.title) = '' THEN 'empty_title'
           WHEN char_length(p.title) > 120 THEN 'title_over_120'
           WHEN p.title <> btrim(regexp_replace(p.title, '\s+', ' ', 'g')) THEN 'title_whitespace'
           WHEN p.title ~ '[[:alpha:]]' AND p.title = upper(p.title) AND p.title <> lower(p.title) THEN 'title_all_uppercase'
           ELSE 'title_manual_review'
         END AS candidate_class
  FROM public.properties p
  UNION ALL
  SELECT 'user_listings', l.id, l.status = 'approved', l.title, NULL::text, l.slug,
         CASE
           WHEN l.title IS NULL OR btrim(l.title) = '' THEN 'empty_title'
           WHEN char_length(l.title) > 120 THEN 'title_over_120'
           WHEN l.title <> btrim(regexp_replace(l.title, '\s+', ' ', 'g')) THEN 'title_whitespace'
           WHEN l.title ~ '[[:alpha:]]' AND l.title = upper(l.title) AND l.title <> lower(l.title) THEN 'title_all_uppercase'
           ELSE 'title_manual_review'
         END
  FROM public.user_listings l
)
SELECT now() AS measured_at, source, id,
       CASE WHEN public_active THEN 'high' ELSE 'medium' END AS severity,
       'manual_review_title_quality' AS candidate_class,
       'title_review_candidate' AS check_code,
       current_value, proposed_value, slug,
       'Chưa gọi normalize_listing_title để tránh phụ thuộc migration chưa có trên production; đối chiếu function inventory trước khi backfill' AS notes
FROM title_candidates
WHERE candidate_class <> 'title_manual_review'
ORDER BY public_active DESC, source, id
LIMIT 500;

ROLLBACK;
