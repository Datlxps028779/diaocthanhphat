-- Chuẩn hoá FAQ sản phẩm đã lưu: các tin cũ được "Gợi ý hỏi + đáp" ở bản trước đã
-- nhét TIÊU ĐỀ tin vào phần CÂU HỎI (vd "Giá bán Nhà phố Dĩ An là bao nhiêu?").
-- Bản mới sinh câu hỏi trung tính "Bất động sản này". Trang chi tiết ưu tiên faq
-- lưu trong DB nên tin cũ vẫn hiện tiêu đề. Migration này thay tiêu đề tin bằng
-- "Bất động sản này" trong CÂU HỎI đã lưu (đáp án không chứa tiêu đề nên giữ nguyên).
-- Idempotent: chạy lại không đổi gì (sau lần đầu tiêu đề không còn trong câu hỏi).

UPDATE public.properties p
SET faq = (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(item) = 'object' AND (item ? 'question')
      THEN jsonb_set(
             item,
             '{question}',
             to_jsonb(replace(item->>'question', p.title, 'Bất động sản này'))
           )
      ELSE item
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(p.faq) WITH ORDINALITY AS t(item, ord)
)
WHERE p.title IS NOT NULL
  AND p.title <> ''
  AND p.faq IS NOT NULL
  AND jsonb_typeof(p.faq) = 'array'
  AND jsonb_array_length(p.faq) > 0
  AND position(p.title IN p.faq::text) > 0;
