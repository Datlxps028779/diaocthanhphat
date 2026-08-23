-- Structured page content collections
-- Idempotent: creates structured collection blocks without overwriting non-empty
-- admin-managed JSON. Content remains editable in Admin > Quản lý trang.

INSERT INTO public.page_blocks (page_slug, section, key, label, type, value, order_index)
VALUES
  ('about', 'stats', 'items', 'Các số liệu nổi bật', 'collection', '{"version":1,"items":[]}', 99),
  ('about', 'values', 'items', 'Giá trị cốt lõi', 'collection', '{"version":1,"items":[]}', 99),
  ('about', 'timeline', 'items', 'Hành trình phát triển', 'collection', '{"version":1,"items":[]}', 99),
  ('about', 'team', 'items', 'Đội ngũ', 'collection', '{"version":1,"items":[]}', 99),
  ('invest', 'calculator', 'labels', 'Nhãn công cụ tính ROI', 'collection', '{"version":1,"items":[]}', 99),
  ('invest', 'opportunities', 'items', 'Cơ hội đầu tư', 'collection', '{"version":1,"items":[]}', 99),
  ('invest', 'process', 'items', 'Quy trình đầu tư', 'collection', '{"version":1,"items":[]}', 99),
  ('invest', 'benefits', 'items', 'Lý do lựa chọn', 'collection', '{"version":1,"items":[]}', 99)
ON CONFLICT (page_slug, section, key) DO NOTHING;

-- Migrate only known ABOUT legacy records. A populated structured collection is
-- never replaced. Legacy source rows remain untouched for rollback/audit.
WITH legacy AS (
  SELECT jsonb_build_object(
    'version', 1,
    'items', jsonb_agg(jsonb_build_object('value', value_block.value, 'label', label_block.value) ORDER BY value_block.key)
  )::text AS value
  FROM public.page_blocks value_block
  JOIN public.page_blocks label_block
    ON label_block.page_slug = 'about'
   AND label_block.section = 'stats'
   AND label_block.key = replace(value_block.key, '_value', '_label')
  WHERE value_block.page_slug = 'about'
    AND value_block.section = 'stats'
    AND value_block.key IN ('stat1_value', 'stat2_value', 'stat3_value', 'stat4_value')
)
UPDATE public.page_blocks target
SET value = legacy.value, type = 'collection', label = 'Các số liệu nổi bật'
FROM legacy
WHERE target.page_slug = 'about' AND target.section = 'stats' AND target.key = 'items'
  AND legacy.value IS NOT NULL
  AND (target.type <> 'collection' OR target.value !~ E'^\s*\{' OR COALESCE(jsonb_array_length((target.value::jsonb)->'items'), 0) = 0);

WITH legacy AS (
  SELECT jsonb_build_object(
    'version', 1,
    'items', jsonb_agg(jsonb_build_object('title', title_block.value, 'description', desc_block.value) ORDER BY title_block.key)
  )::text AS value
  FROM public.page_blocks title_block
  JOIN public.page_blocks desc_block
    ON desc_block.page_slug = 'about'
   AND desc_block.section = 'values'
   AND desc_block.key = replace(title_block.key, '_title', '_desc')
  WHERE title_block.page_slug = 'about'
    AND title_block.section = 'values'
    AND title_block.key IN ('v1_title', 'v2_title', 'v3_title', 'v4_title')
)
UPDATE public.page_blocks target
SET value = legacy.value, type = 'collection', label = 'Giá trị cốt lõi'
FROM legacy
WHERE target.page_slug = 'about' AND target.section = 'values' AND target.key = 'items'
  AND legacy.value IS NOT NULL
  AND (target.type <> 'collection' OR target.value !~ E'^\s*\{' OR COALESCE(jsonb_array_length((target.value::jsonb)->'items'), 0) = 0);

WITH legacy AS (
  SELECT jsonb_build_object(
    'version', 1,
    'items', jsonb_agg(jsonb_build_object(
      'year', split_part(line, '|', 1),
      'title', split_part(line, '|', 2),
      'description', split_part(line, '|', 3)
    ) ORDER BY ord)
  )::text AS value
  FROM public.page_blocks source
  CROSS JOIN LATERAL unnest(string_to_array(source.value, E'\n')) WITH ORDINALITY AS lines(line, ord)
  WHERE source.page_slug = 'about' AND source.section = 'timeline' AND source.key = 'items'
    AND source.value IS NOT NULL AND source.value <> ''
    AND split_part(line, '|', 1) <> '' AND split_part(line, '|', 2) <> '' AND split_part(line, '|', 3) <> ''
  GROUP BY source.value
)
UPDATE public.page_blocks target
SET value = legacy.value, type = 'collection', label = 'Hành trình phát triển'
FROM legacy
WHERE target.page_slug = 'about' AND target.section = 'timeline' AND target.key = 'items'
  AND legacy.value IS NOT NULL
  AND (target.type <> 'collection' OR target.value !~ E'^\s*\{' OR COALESCE(jsonb_array_length((target.value::jsonb)->'items'), 0) = 0);

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
  CROSS JOIN LATERAL unnest(string_to_array(source.value, E'\n')) WITH ORDINALITY AS lines(line, ord)
  WHERE source.page_slug = 'about' AND source.section = 'team' AND source.key = 'members'
    AND source.value IS NOT NULL AND source.value <> ''
    AND split_part(line, '|', 1) <> '' AND split_part(line, '|', 2) <> ''
  GROUP BY source.value
)
UPDATE public.page_blocks target
SET value = legacy.value, type = 'collection', label = 'Đội ngũ'
FROM legacy
WHERE target.page_slug = 'about' AND target.section = 'team' AND target.key = 'items'
  AND legacy.value IS NOT NULL
  AND (target.type <> 'collection' OR target.value !~ E'^\s*\{' OR COALESCE(jsonb_array_length((target.value::jsonb)->'items'), 0) = 0);

-- Move the former investment page dataset into editable CMS storage. This is
-- initial database content, not a frontend fallback; administrators can replace it.
INSERT INTO public.page_blocks (page_slug, section, key, label, type, value, order_index)
VALUES
  ('invest', 'opportunities', 'items', 'Cơ hội đầu tư', 'collection', '{"version":1,"items":[{"title":"Đất nền KDC","location":"Bình Dương, Long An","tag":"Phổ biến","description":"Đất nền khu dân cư có sổ đỏ riêng, pháp lý minh bạch, hạ tầng đồng bộ.","features":["Sổ đỏ riêng từng lô","Hạ tầng hoàn chỉnh","Gần KCN lớn","Thanh khoản cao"],"return_label":"15–20%/năm","minimum_capital":"1,5 tỷ"},{"title":"Đất ven sông","location":"Bình Phước, Tây Ninh","tag":"Tiềm năng cao","description":"Quỹ đất ven sông khan hiếm, cảnh quan đẹp, phù hợp phát triển nghỉ dưỡng và farmstay.","features":["Giá còn thấp","View sông độc đáo","Phát triển du lịch","Tiềm năng tăng giá"],"return_label":"20–30%/năm","minimum_capital":"800 triệu"},{"title":"Đất Bình Phước","location":"Chơn Thành, Đồng Phú","tag":"Mới nổi","description":"Giá đất vẫn còn rất thấp so với mặt bằng chung, cao tốc đang thi công sẽ thúc đẩy tăng giá mạnh.","features":["Giá thấp nhất vùng","Cao tốc sắp thông","KCN Becamex lớn","ROI hấp dẫn"],"return_label":"25–35%/năm","minimum_capital":"500 triệu"},{"title":"Nhà phố TM","location":"Bình Dương, Long An","tag":"Dòng tiền ổn định","description":"Nhà phố thương mại mặt tiền đường lớn, vừa ở vừa kinh doanh, dòng tiền cho thuê ổn định.","features":["Mặt tiền kinh doanh","Cho thuê ổn định","Giá trị tăng đều","Pháp lý vững"],"return_label":"12–18%/năm","minimum_capital":"2,5 tỷ"}]}', 99),
  ('invest', 'process', 'items', 'Quy trình đầu tư', 'collection', '{"version":1,"items":[{"number":"01","title":"Tư vấn nhu cầu","description":"Chuyên gia lắng nghe mục tiêu, ngân sách và khả năng rủi ro của bạn"},{"number":"02","title":"Đề xuất danh mục","description":"Chúng tôi lọc ra 3–5 sản phẩm phù hợp nhất từ danh mục hơn 200 BĐS"},{"number":"03","title":"Khảo sát thực tế","description":"Đưa khách đi xem thực địa, kiểm tra pháp lý, hạ tầng xung quanh"},{"number":"04","title":"Đàm phán & ký kết","description":"Hỗ trợ đàm phán giá tốt nhất và soạn thảo hợp đồng minh bạch"},{"number":"05","title":"Hậu mãi & quản lý","description":"Theo dõi thị trường, hỗ trợ bán lại hoặc cho thuê khi cần"}]}', 99),
  ('invest', 'benefits', 'items', 'Lý do lựa chọn', 'collection', '{"version":1,"items":[{"title":"Pháp lý 100% minh bạch","description":"Kiểm tra kỹ từng dự án trước khi giới thiệu"},{"title":"ROI vượt ngân hàng","description":"Trung bình 15–25% mỗi năm tại các khu vực trọng điểm"},{"title":"1.200+ khách hài lòng","description":"Đội ngũ có kinh nghiệm và mạng lưới rộng khắp"},{"title":"Tư vấn miễn phí","description":"Không phí tư vấn, không ràng buộc, hoàn toàn trung thực"}]}', 99)
ON CONFLICT (page_slug, section, key) DO UPDATE
SET value = CASE
  WHEN public.page_blocks.value IS NULL OR public.page_blocks.value = '' OR public.page_blocks.value = '{"version":1,"items":[]}'
  THEN EXCLUDED.value ELSE public.page_blocks.value END,
  type = 'collection', label = EXCLUDED.label;

-- Seed calculator labels in the database so all visible copy remains editable.
INSERT INTO public.page_blocks (page_slug, section, key, label, type, value, order_index)
VALUES ('invest', 'calculator', 'labels', 'Nhãn công cụ tính ROI', 'collection', '{"version":1,"items":[{"heading":"Tính toán lợi nhuận","subtitle":"Nhập thông số để xem dự báo","capital":"Vốn đầu tư","capital_unit":"tỷ VND","yield_rate":"Tỷ suất lợi nhuận/năm","years":"năm","action":"Tìm sản phẩm phù hợp","result_heading":"Kết quả dự báo","initial_capital":"Vốn ban đầu","projected_value":"Giá trị sau","profit":"Lợi nhuận","total_return":"Tổng lợi nhuận","disclaimer":"* Dự báo dựa trên tốc độ tăng trưởng trung bình, không đảm bảo kết quả thực tế."}]}', 99)
ON CONFLICT (page_slug, section, key) DO UPDATE
SET value = CASE
  WHEN public.page_blocks.value IS NULL OR public.page_blocks.value = '' OR public.page_blocks.value = '{"version":1,"items":[]}'
  THEN EXCLUDED.value ELSE public.page_blocks.value END,
  type = 'collection', label = EXCLUDED.label;

-- Read-only verification after the user applies this migration:
-- SELECT page_slug, section, key, type,
--        CASE WHEN value ~ E'^\s*\{' THEN jsonb_array_length(COALESCE((value::jsonb)->'items', '[]'::jsonb)) END AS item_count,
--        updated_at
-- FROM public.page_blocks
-- WHERE (page_slug = 'about' AND section IN ('stats','values','timeline','team') AND key = 'items')
--    OR (page_slug = 'invest' AND section IN ('calculator','opportunities','process','benefits') AND key IN ('labels','items'))
-- ORDER BY page_slug, section;