-- Trợ lý BĐS: chấm điểm sản phẩm theo nhu cầu khách (thuật toán cộng điểm), tách
-- riêng RPC search_property_matches của trang Listings để không gây hồi quy.
--
-- Nguyên tắc: chỉ listing_type (mua/thuê) và is_active là RÀNG BUỘC CỨNG; các tiêu
-- chí còn lại là "mềm" → cộng điểm rồi xếp hạng trên toàn kho, lấy top. Điểm số do
-- SQL tính từ dữ liệu thật (không để AI bịa). Thang điểm theo update-AI-chatbot.md:
--   +30 đúng khu vực · +25 đúng loại · +20 đúng ngân sách (near-miss +10)
--   +10 đúng diện tích · +10 có hỗ trợ vay (khi khách cần) · +5 đúng pháp lý
CREATE OR REPLACE FUNCTION public.match_properties_for_advisor(
  f_listing_type text DEFAULT NULL,
  f_area_id uuid DEFAULT NULL,
  f_type_id uuid DEFAULT NULL,
  f_district text DEFAULT NULL,
  f_ward text DEFAULT NULL,
  f_target_price numeric DEFAULT NULL,
  f_target_area numeric DEFAULT NULL,
  f_want_loan boolean DEFAULT NULL,
  f_legal text DEFAULT NULL,
  kw text DEFAULT NULL,
  f_limit integer DEFAULT 5
)
RETURNS TABLE(id uuid, score integer, total_count bigint)
LANGUAGE sql
STABLE
AS $$
  WITH args AS (
    SELECT
      NULLIF(trim(coalesce(kw, '')), '') AS clean_kw,
      CASE
        WHEN NULLIF(trim(coalesce(kw, '')), '') IS NULL THEN NULL
        ELSE websearch_to_tsquery('simple', public.f_unaccent(trim(kw)))
      END AS tsq,
      greatest(1, least(coalesce(f_limit, 5), 20)) AS lim
  ),
  scored AS (
    SELECT
      p.id,
      (
        -- +30 đúng khu vực: khớp bất kỳ tầng địa lý nào khách nêu
        CASE WHEN (f_area_id IS NOT NULL AND p.area_id = f_area_id)
               OR (f_district IS NOT NULL AND p.district = f_district)
               OR (f_ward IS NOT NULL AND p.ward = f_ward)
             THEN 30 ELSE 0 END
        -- +25 đúng loại BĐS
        + CASE WHEN f_type_id IS NOT NULL AND p.property_type_id = f_type_id THEN 25 ELSE 0 END
        -- +20 trong ngân sách; +10 nếu vượt nhẹ (trong 15%) — "gần đúng" vẫn đáng xem
        + CASE
            WHEN f_target_price IS NULL THEN 0
            WHEN p.price <= f_target_price THEN 20
            WHEN p.price <= f_target_price * 1.15 THEN 10
            ELSE 0
          END
        -- +10 diện tích gần đúng (±20%)
        + CASE
            WHEN f_target_area IS NULL OR p.area_sqm IS NULL THEN 0
            WHEN p.area_sqm BETWEEN f_target_area * 0.8 AND f_target_area * 1.2 THEN 10
            ELSE 0
          END
        -- +10 có hỗ trợ vay khi khách cần vay
        + CASE WHEN f_want_loan IS TRUE AND p.loan_support IS NOT NULL THEN 10 ELSE 0 END
        -- +5 đúng pháp lý
        + CASE WHEN f_legal IS NOT NULL AND p.legal_status = f_legal THEN 5 ELSE 0 END
        -- +nhẹ nếu khớp full-text keyword (giúp phân biệt trong nhóm cùng điểm)
        + CASE
            WHEN a.tsq IS NULL THEN 0
            WHEN public.property_ai_search_vector(
              p.title, p.address, p.city, p.district, p.ward, p.description,
              p.legal_status, p.focus_keywords, p.meta_title, p.meta_description,
              p.tags, p.amenities
            ) @@ a.tsq THEN 4
            ELSE 0
          END
      )::integer AS score,
      p.is_verified,
      p.created_at
    FROM public.properties p
    CROSS JOIN args a
    WHERE p.is_active = true
      AND (f_listing_type IS NULL OR p.listing_type = f_listing_type)
  )
  SELECT id, score, count(*) OVER () AS total_count
  FROM scored
  WHERE score > 0
  ORDER BY score DESC, is_verified DESC, created_at DESC
  LIMIT (SELECT lim FROM args)
$$;

GRANT EXECUTE ON FUNCTION public.match_properties_for_advisor(
  text, uuid, uuid, text, text, numeric, numeric, boolean, text, text, integer
) TO anon, authenticated;

-- System Prompt cho Trợ lý BĐS — admin chỉnh được trong tab "Đào tạo AI". Guardrail
-- chống-bịa được KHÓA CỨNG thêm trong Edge Function nên dù admin sửa prompt này thì
-- vẫn không thể tắt luật không bịa số liệu.
INSERT INTO site_settings (key, value, label, group_name, type) VALUES
  (
    'ai_system_prompt',
    E'Bạn là Trợ lý của Chợ Nhà Tốt (bất động sản Bình Dương).\n\nVAI TRÒ:\n- Hiểu nhu cầu khách hàng (mua/thuê, khu vực, ngân sách, loại BĐS, diện tích, vay, pháp lý).\n- Tìm sản phẩm phù hợp và giới thiệu.\n- Xin số điện thoại khi cần để tư vấn viên hỗ trợ.\n\nBẠN KHÔNG ĐƯỢC:\n- Tư vấn đầu tư hoặc cam kết lợi nhuận.\n- Tư vấn pháp lý chuyên sâu hoặc xác nhận quy hoạch.\n- Tự tạo dữ liệu, tự bịa số liệu, lãi suất, tỷ lệ tăng giá.\n- Suy đoán những gì không có trong dữ liệu.\n\nNếu khách hỏi ngoài dữ liệu:\n"Em chưa có đủ dữ liệu để xác nhận. Anh/chị vui lòng để lại số điện thoại để tư vấn viên hỗ trợ chi tiết hơn."\n\nLUÔN:\n1. Tóm tắt nhu cầu khách.\n2. Đưa tối đa 5 sản phẩm phù hợp.\n3. Hỏi thêm nếu chưa đủ thông tin.\n4. Xin số điện thoại sau 3 lượt trao đổi.',
    'System Prompt (bộ não Trợ lý AI)',
    'ai_chat',
    'textarea'
  )
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
