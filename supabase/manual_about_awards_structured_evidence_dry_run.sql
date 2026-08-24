-- READ ONLY — kiểm tra khối Giải thưởng & Chứng nhận trước/sau migration.
-- Không có INSERT, UPDATE, DELETE hoặc DDL.

WITH award_block AS (
  SELECT value, type
  FROM public.page_blocks
  WHERE page_slug = 'about' AND section = 'awards' AND key = 'items'
), parsed AS (
  SELECT
    value,
    type,
    CASE
      WHEN type = 'collection' AND btrim(value) LIKE '{%' THEN value::jsonb
      ELSE NULL
    END AS collection
  FROM award_block
), items AS (
  SELECT
    item,
    ordinal
  FROM parsed
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(collection -> 'items', '[]'::jsonb)) WITH ORDINALITY AS entries(item, ordinal)
)
SELECT
  (SELECT count(*) FROM award_block) AS matching_blocks,
  (SELECT type FROM award_block LIMIT 1) AS current_block_type,
  (SELECT CASE WHEN type = 'collection' THEN 'structured_or_malformed_collection' ELSE 'legacy_list_or_empty' END FROM award_block LIMIT 1) AS storage_state,
  (SELECT count(*) FROM items) AS structured_items,
  (SELECT count(*) FROM items WHERE NULLIF(btrim(item ->> 'title'), '') IS NOT NULL) AS items_with_title,
  (SELECT count(*) FROM items WHERE NULLIF(btrim(item ->> 'source_url'), '') ~ '^https?://') AS items_with_http_source,
  (SELECT count(*) FROM items WHERE NULLIF(btrim(item ->> 'title'), '') IS NOT NULL AND NULLIF(btrim(item ->> 'source_url'), '') ~ '^https?://') AS public_items_after_gate,
  (SELECT count(*) FROM items WHERE NULLIF(btrim(item ->> 'title'), '') IS NOT NULL AND COALESCE(NULLIF(btrim(item ->> 'source_url'), ''), '') !~ '^https?://') AS draft_items_needing_source;

-- Preview tối đa 50 mục structured; chỉ truy vấn, không công bố/chỉnh dữ liệu.
WITH award_block AS (
  SELECT value, type
  FROM public.page_blocks
  WHERE page_slug = 'about' AND section = 'awards' AND key = 'items'
)
SELECT
  ordinal AS display_order,
  item ->> 'title' AS title,
  item ->> 'issuer' AS issuer,
  item ->> 'year' AS year,
  item ->> 'source_url' AS source_url,
  CASE
    WHEN NULLIF(btrim(item ->> 'title'), '') IS NOT NULL AND NULLIF(btrim(item ->> 'source_url'), '') ~ '^https?://' THEN 'will_render'
    ELSE 'draft_needs_http_source'
  END AS public_status
FROM award_block
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN type = 'collection' AND btrim(value) LIKE '{%' THEN value::jsonb -> 'items' ELSE '[]'::jsonb END
) WITH ORDINALITY AS entries(item, ordinal)
ORDER BY ordinal
LIMIT 50;
