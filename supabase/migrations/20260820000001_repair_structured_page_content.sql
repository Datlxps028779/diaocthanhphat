-- Repair the first structured-content migration where legacy literal "\\n"
-- sequences were treated as ordinary text. This migration is intentionally
-- narrow and idempotent; review the read-only query before applying it.

-- Team source is still preserved in about/team/members, so rebuild the
-- structured team collection from that source using a literal backslash+n
-- separator as well as real line breaks.
WITH legacy AS (
  SELECT jsonb_build_object(
    'version', 1,
    'items', jsonb_agg(jsonb_build_object(
      'name', split_part(line, '|', 1),
      'role', split_part(line, '|', 2),
      'experience', split_part(line, '|', 3),
      'image', split_part(line, '|', 4)
    ) ORDER BY ord)
  )::text AS value
  FROM public.page_blocks source
  CROSS JOIN LATERAL regexp_split_to_table(
    replace(source.value, chr(92) || 'n', chr(10)),
    chr(10)
  ) WITH ORDINALITY AS lines(line, ord)
  WHERE source.page_slug = 'about'
    AND source.section = 'team'
    AND source.key = 'members'
    AND source.value IS NOT NULL
    AND trim(line) <> ''
    AND split_part(line, '|', 1) <> ''
    AND split_part(line, '|', 2) <> ''
)
UPDATE public.page_blocks target
SET value = legacy.value, type = 'collection', label = 'Đội ngũ'
FROM legacy
WHERE target.page_slug = 'about'
  AND target.section = 'team'
  AND target.key = 'items'
  AND target.type = 'collection'
  AND COALESCE(jsonb_array_length((target.value::jsonb)->'items'), 0) <= 1;

-- The timeline source was the same row as the migration target and was
-- overwritten before the separator bug was detected. Restore only the known
-- seeded records that are identifiable by the malformed first description.
UPDATE public.page_blocks
SET value = '{"version":1,"items":[
  {"year":"2018","title":"Thành lập công ty","description":"Chợ Nhà Việt ra đời với đội ngũ 10 người tại Bình Dương."},
  {"year":"2019","title":"Mở rộng khu vực","description":"Mở rộng hoạt động sang Đồng Nai và TP. Hồ Chí Minh."},
  {"year":"2020","title":"500 giao dịch","description":"Đạt mốc 500 giao dịch thành công đầu tiên dù bối cảnh dịch bệnh."},
  {"year":"2022","title":"Nền tảng số","description":"Ra mắt website và hệ thống quản lý BĐS trực tuyến."},
  {"year":"2024","title":"Mở rộng Bình Phước","description":"Phủ sóng thêm thị trường Bình Phước – mảnh đất nhiều tiềm năng."},
  {"year":"2025","title":"1.200+ khách hàng","description":"Đạt mốc 1.200 khách hàng hài lòng, 500+ dự án thành công."}
]}',
    type = 'collection',
    label = 'Hành trình phát triển'
WHERE page_slug = 'about'
  AND section = 'timeline'
  AND key = 'items'
  AND type = 'collection'
  AND value LIKE '%Bình Dương.2019%';

-- Read-only verification (run after applying this repair):
-- SELECT page_slug, section, key, type,
--        jsonb_array_length(COALESCE((value::jsonb)->'items', '[]'::jsonb)) AS item_count,
--        value
-- FROM public.page_blocks
-- WHERE page_slug = 'about'
--   AND section IN ('timeline', 'team')
--   AND key = 'items';
-- Expected: timeline item_count = 6, team item_count = 4.
-- Note: about/mission/items contains an existing malformed text value
-- ("giao dịchn. Bảo...") that requires editorial review; this migration does
-- not silently rewrite that claim.