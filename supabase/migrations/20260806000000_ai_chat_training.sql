-- Đào tạo AI Chat (Trợ lý BĐS) — kho câu Hỏi–Đáp do admin tự soạn để AI khớp theo
-- từ khóa và trả lời sẵn. AI chat vẫn thuần rule-based: chỉ dùng nội dung admin
-- soạn ở đây + dữ liệu tin đăng thật, KHÔNG bịa. Lời mặc định (lời chào, gợi ý mẫu,
-- 3 câu nhạy cảm vay/pháp lý/đầu tư) lưu trong site_settings group 'ai_chat'.

-- ─────────────────────────────────────────────────────────────────────────────
-- Bảng kho tri thức Hỏi–Đáp
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_chat_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  keywords text NOT NULL,
  answer text NOT NULL,
  priority int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_chat_knowledge ENABLE ROW LEVEL SECURITY;

-- Public đọc câu đang bật (chat công khai cần đọc bằng anon key)
DROP POLICY IF EXISTS "public_select_ai_chat_knowledge" ON ai_chat_knowledge;
CREATE POLICY "public_select_ai_chat_knowledge" ON ai_chat_knowledge
  FOR SELECT TO anon, authenticated USING (is_active = true);

-- Chỉ admin ghi (KB là admin-only, staff không sửa)
DROP POLICY IF EXISTS "admin_insert_ai_chat_knowledge" ON ai_chat_knowledge;
CREATE POLICY "admin_insert_ai_chat_knowledge" ON ai_chat_knowledge
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_ai_chat_knowledge" ON ai_chat_knowledge;
CREATE POLICY "admin_update_ai_chat_knowledge" ON ai_chat_knowledge
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_ai_chat_knowledge" ON ai_chat_knowledge;
CREATE POLICY "admin_delete_ai_chat_knowledge" ON ai_chat_knowledge
  FOR DELETE TO authenticated USING (is_admin());

-- Admin đọc được cả câu đang tắt (để quản lý). Gộp chung SELECT ở trên chỉ trả
-- is_active=true, nên thêm policy admin đọc tất cả.
DROP POLICY IF EXISTS "admin_select_all_ai_chat_knowledge" ON ai_chat_knowledge;
CREATE POLICY "admin_select_all_ai_chat_knowledge" ON ai_chat_knowledge
  FOR SELECT TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed vài chủ đề mẫu thật để admin có ví dụ tham khảo
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ai_chat_knowledge (topic, keywords, answer, priority) VALUES
  (
    'Vay ngân hàng',
    'vay, vay ngân hàng, trả góp, lãi suất, vay bao nhiêu, hỗ trợ vay',
    'Nhiều bất động sản bên em có hỗ trợ vay ngân hàng tới 70% giá trị. Lãi suất và hạn mức cụ thể tùy ngân hàng và hồ sơ thu nhập của anh/chị, em không tự đưa con số lãi suất. Anh/chị để lại thông tin, tư vấn viên sẽ đối chiếu phương án vay phù hợp nhất.',
    10
  ),
  (
    'Pháp lý sổ hồng',
    'sổ hồng, sổ đỏ, pháp lý, công chứng, sang tên, giấy tờ',
    'Mỗi tin đăng đều ghi rõ tình trạng pháp lý (sổ hồng riêng, sổ chung, hợp đồng mua bán…). Em ưu tiên các bất động sản pháp lý minh bạch. Trước khi đặt cọc anh/chị nên kiểm tra hồ sơ gốc và quy hoạch; tư vấn viên có thể hỗ trợ kiểm tra kỹ từng tin.',
    10
  ),
  (
    'Phí dịch vụ',
    'phí, phí môi giới, phí dịch vụ, hoa hồng, mất phí, tốn phí',
    'Người mua/thuê xem tin và liên hệ tư vấn viên bên em hoàn toàn miễn phí. Anh/chị chỉ cần để lại thông tin để được tư vấn chi tiết về giá, pháp lý và thủ tục.',
    5
  )
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed lời mặc định vào site_settings (group 'ai_chat'). Giá trị = đúng chuỗi đang
-- hardcode trong AiSearchChat/aiAdvisor để không đổi trải nghiệm khi admin chưa chỉnh.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO site_settings (key, value, label, group_name, type) VALUES
  (
    'ai_greeting',
    'Em là Trợ lý BĐS. Anh/chị mô tả nhu cầu mua/thuê, em sẽ lọc tin phù hợp và có thể gửi thông tin cho tư vấn viên.',
    'Lời chào mở đầu',
    'ai_chat',
    'textarea'
  ),
  (
    'ai_examples',
    E'Nhà Dĩ An dưới 3 tỷ sổ hồng\nCho thuê căn hộ Thủ Dầu Một 5-10 triệu\nĐất nền Bến Cát trên 100m2 gần VSIP\nTôi cần tư vấn pháp lý',
    'Câu hỏi gợi ý mẫu (mỗi dòng 1 câu)',
    'ai_chat',
    'textarea'
  ),
  (
    'ai_answer_loan',
    'Lãi suất và hạn mức vay phụ thuộc ngân hàng, hồ sơ thu nhập và tài sản đảm bảo. Em không tự bịa con số lãi suất; em có thể chuyển thông tin cho tư vấn viên để đối chiếu phương án vay phù hợp.',
    'Câu trả lời khi khách hỏi về vay/lãi suất',
    'ai_chat',
    'textarea'
  ),
  (
    'ai_answer_legal',
    'Thông tin pháp lý chỉ nên xem như tham khảo. Anh/chị cần kiểm tra hồ sơ gốc, tình trạng quy hoạch và công chứng trước khi đặt cọc. Em có thể gửi nhu cầu cho tư vấn viên để kiểm tra kỹ từng tin.',
    'Câu trả lời khi khách hỏi về pháp lý',
    'ai_chat',
    'textarea'
  ),
  (
    'ai_answer_investment',
    'Đầu tư BĐS cần xem vị trí, pháp lý, thanh khoản, dòng tiền và thời gian nắm giữ. Không có cam kết lợi nhuận cố định; em có thể gợi ý tin phù hợp và chuyển tư vấn viên phân tích sâu hơn.',
    'Câu trả lời khi khách hỏi về đầu tư/lợi nhuận',
    'ai_chat',
    'textarea'
  )
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
