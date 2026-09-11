-- =============================================================================
-- A2 read-only: news corpus quality / republish readiness
--
-- Does NOT write. Does NOT change schema. Run in Supabase SQL Editor.
-- Approximates src/lib/articleIngestQuality.ts + countInternalLinks()
-- (href="/..." in news.content). Not a 1:1 port of every HTML edge case.
-- Postgres POSIX: do NOT use \b (that is backspace, not a word boundary).
-- H2_COUNT from this script is only a tag count of '<h2' / '<H2', not the TS gate.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH news_metrics AS (
  SELECT
    n.id,
    n.slug,
    n.is_published,
    n.content_version,
    n.area_id,
    n.district_id,
    n.ward_id,
    n.neighborhood_id,
    length(btrim(coalesce(n.title, ''))) AS title_len,
    length(btrim(coalesce(n.excerpt, ''))) AS excerpt_len,
    length(btrim(coalesce(n.meta_title, ''))) AS meta_title_len,
    length(btrim(coalesce(n.meta_description, ''))) AS meta_description_len,
    length(btrim(coalesce(n.geo_area, ''))) AS geo_area_len,
    length(btrim(coalesce(n.geo_entity, ''))) AS geo_entity_len,
    length(btrim(coalesce(n.geo_notes, ''))) AS geo_notes_len,
    length(btrim(coalesce(n.author, ''))) AS author_len,
    length(btrim(coalesce(n.image_url, ''))) AS image_url_len,
    CASE WHEN jsonb_typeof(coalesce(n.faq::jsonb, '[]'::jsonb)) = 'array'
      THEN jsonb_array_length(coalesce(n.faq::jsonb, '[]'::jsonb)) ELSE 0 END AS faq_count,
    CASE WHEN jsonb_typeof(coalesce(n.citations::jsonb, '[]'::jsonb)) = 'array'
      THEN jsonb_array_length(coalesce(n.citations::jsonb, '[]'::jsonb)) ELSE 0 END AS citation_count,
    coalesce((
      SELECT count(*)
      FROM regexp_matches(coalesce(n.content, ''), 'href=["'']\/[^"'']+["'']', 'gi')
    ), 0) AS content_rel_hrefs,
    coalesce((
      SELECT count(*)
      FROM regexp_matches(coalesce(n.content, ''), 'href=["'']https?://chonhaviet\.com/[^"'']+["'']', 'gi')
    ), 0) AS content_absolute_site_hrefs,
    coalesce((
      SELECT count(*)
      FROM regexp_matches(coalesce(n.content, ''), '<h2\b', 'gi')
    ), 0) AS h2_count,
    coalesce(array_length(regexp_split_to_array(
      btrim(regexp_replace(coalesce(n.content, ''), '<[^>]+>', ' ', 'g')),
      '\s+'
    ), 1), 0) AS approx_word_count,
    coalesce(array_length(ARRAY(
      SELECT btrim(part)
      FROM unnest(string_to_array(coalesce(n.focus_keywords, ''), ',')) AS part
      WHERE btrim(part) <> ''
    ), 1), 0) AS keyword_count
  FROM public.news n
),
flagged AS (
  SELECT
    m.*,
    ARRAY_remove(ARRAY[
      CASE WHEN title_len < 20 OR title_len > 180 THEN 'TITLE_LENGTH' END,
      CASE WHEN excerpt_len < 80 OR excerpt_len > 300 THEN 'EXCERPT_LENGTH' END,
      CASE WHEN approx_word_count < 900 THEN 'CONTENT_TOO_SHORT' END,
      CASE WHEN h2_count < 4 THEN 'H2_COUNT' END,
      CASE WHEN image_url_len = 0 THEN 'FEATURED_IMAGE_REQUIRED' END,
      CASE WHEN meta_title_len < 30 OR meta_title_len > 65 THEN 'META_TITLE_LENGTH' END,
      CASE WHEN meta_description_len < 120 OR meta_description_len > 160 THEN 'META_DESCRIPTION_LENGTH' END,
      CASE WHEN keyword_count < 3 THEN 'KEYWORD_COUNT' END,
      CASE WHEN geo_area_len = 0 THEN 'GEO_AREA_REQUIRED' END,
      CASE WHEN geo_entity_len = 0 THEN 'GEO_ENTITY_REQUIRED' END,
      CASE WHEN geo_notes_len = 0 THEN 'GEO_NOTES_REQUIRED' END,
      CASE WHEN content_rel_hrefs < 2 THEN 'INTERNAL_LINK_COUNT' END,
      CASE WHEN author_len = 0 THEN 'AUTHOR_REQUIRED' END,
      CASE WHEN faq_count < 4 OR faq_count > 6 THEN 'FAQ_COUNT' END,
      CASE WHEN citation_count < 2 OR citation_count > 6 THEN 'CITATION_COUNT' END
    ], NULL) AS blocker_codes
  FROM news_metrics m
),
published AS (
  SELECT * FROM flagged WHERE is_published
)
SELECT jsonb_build_object(
  'inventory', jsonb_build_object(
    'news_rows', (SELECT count(*) FROM public.news),
    'published', (SELECT count(*) FROM published),
    'drafts', (SELECT count(*) FROM public.news WHERE NOT is_published),
    'has_content_version', (SELECT count(*) FROM public.news WHERE content_version IS NOT NULL)
  ),
  'publication_events', jsonb_build_object(
    'total', (SELECT count(*) FROM public.news_publication_events),
    'by_action', (
      SELECT coalesce(jsonb_object_agg(action, n), '{}'::jsonb)
      FROM (
        SELECT action, count(*) AS n
        FROM public.news_publication_events
        GROUP BY action
      ) s
    ),
    'sample_article_events', (
      SELECT coalesce(jsonb_agg(row_to_json(e) ORDER BY e.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT event_id, action, previous_is_published, next_is_published, content_version, created_at
        FROM public.news_publication_events
        WHERE news_id = 'fb9dbc8b-5db2-4d13-8f8e-0f441c5c0549'
        ORDER BY created_at DESC
        LIMIT 5
      ) e
    )
  ),
  'freshness_jobs_news', jsonb_build_object(
    'total', (SELECT count(*) FROM public.seo_freshness_jobs WHERE event_kind = 'news'),
    'by_status', coalesce((
      SELECT jsonb_object_agg(status, n)
      FROM (
        SELECT status, count(*) AS n
        FROM public.seo_freshness_jobs
        WHERE event_kind = 'news'
        GROUP BY status
      ) s
    ), '{}'::jsonb)
  ),
  'structured_location_published', jsonb_build_object(
    'with_area_id', (SELECT count(*) FROM published WHERE area_id IS NOT NULL),
    'with_district_id', (SELECT count(*) FROM published WHERE district_id IS NOT NULL),
    'with_neighborhood_id', (SELECT count(*) FROM published WHERE neighborhood_id IS NOT NULL),
    'with_any_structured_id', (
      SELECT count(*) FROM published
      WHERE area_id IS NOT NULL OR district_id IS NOT NULL OR ward_id IS NOT NULL OR neighborhood_id IS NOT NULL
    )
  ),
  'republish_proxy', jsonb_build_object(
    'published_would_fail', (SELECT count(*) FROM published WHERE cardinality(blocker_codes) > 0),
    'published_would_pass', (SELECT count(*) FROM published WHERE cardinality(blocker_codes) = 0),
    'internal_link_lt2', (SELECT count(*) FROM published WHERE content_rel_hrefs < 2),
    'absolute_site_hrefs_only_risk', (
      SELECT count(*) FROM published
      WHERE content_rel_hrefs < 2 AND content_absolute_site_hrefs >= 2
    ),
    'keyword_lt3', (SELECT count(*) FROM published WHERE keyword_count < 3),
    'faq_out_of_range', (SELECT count(*) FROM published WHERE faq_count < 4 OR faq_count > 6),
    'citation_out_of_range', (SELECT count(*) FROM published WHERE citation_count < 2 OR citation_count > 6)
  ),
  'top_blocker_codes', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('code', code, 'n', n) ORDER BY n DESC), '[]'::jsonb)
    FROM (
      SELECT code, count(*) AS n
      FROM published p
      CROSS JOIN unnest(p.blocker_codes) AS code
      GROUP BY code
      ORDER BY count(*) DESC
      LIMIT 15
    ) t
  ),
  'worst_published_sample', (
    SELECT coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb)
    FROM (
      SELECT slug, content_rel_hrefs, content_absolute_site_hrefs, keyword_count,
             faq_count, citation_count, h2_count, approx_word_count, blocker_codes
      FROM published
      WHERE cardinality(blocker_codes) > 0
      ORDER BY cardinality(blocker_codes) DESC, slug
      LIMIT 15
    ) s
  )
) AS a2_news_corpus;

COMMIT;
