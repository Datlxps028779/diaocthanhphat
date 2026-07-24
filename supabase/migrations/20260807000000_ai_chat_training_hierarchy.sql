ALTER TABLE ai_chat_knowledge
  ADD COLUMN IF NOT EXISTS knowledge_type text NOT NULL DEFAULT 'priority_qa',
  ADD COLUMN IF NOT EXISTS question_examples text,
  ADD COLUMN IF NOT EXISTS handoff_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guardrail text,
  ADD COLUMN IF NOT EXISTS expected_behavior text,
  ADD COLUMN IF NOT EXISTS must_not_answer text,
  ADD COLUMN IF NOT EXISTS typo_variants text;

ALTER TABLE ai_chat_knowledge
  DROP CONSTRAINT IF EXISTS ai_chat_knowledge_type_check;
ALTER TABLE ai_chat_knowledge
  ADD CONSTRAINT ai_chat_knowledge_type_check
  CHECK (knowledge_type IN ('priority_qa', 'background', 'rule', 'test_case'));

UPDATE ai_chat_knowledge
SET knowledge_type = 'priority_qa'
WHERE knowledge_type IS NULL OR knowledge_type = '';

DROP POLICY IF EXISTS "public_select_ai_chat_knowledge" ON ai_chat_knowledge;
CREATE POLICY "public_select_ai_chat_knowledge" ON ai_chat_knowledge
  FOR SELECT TO anon, authenticated
  USING (is_active = true AND knowledge_type IN ('priority_qa', 'background', 'rule'));

INSERT INTO ai_chat_knowledge (
  topic, knowledge_type, keywords, question_examples, typo_variants, answer, priority,
  handoff_required, guardrail, expected_behavior, must_not_answer
)
SELECT * FROM (VALUES
  (
    'Quy tắc không bịa số liệu',
    'rule',
    'không bịa, số liệu, lãi suất, quy hoạch, lợi nhuận',
    'Giá khu này tăng bao nhiêu phần trăm?\nLãi suất vay hiện tại bao nhiêu?\nCăn này có dính quy hoạch không?',
    'khong bia, lai suat, quy hoach, loi nhuan',
    'Nếu hệ thống hoặc admin chưa cung cấp dữ liệu xác thực, Trợ lý phải nói rõ chưa đủ dữ liệu và mời tư vấn viên kiểm tra; không tự tạo phần trăm, lãi suất, quy hoạch hay cam kết lợi nhuận.',
    100,
    true,
    'Không tự bịa số liệu, tên dự án, quy hoạch, lãi suất, tỷ lệ tăng giá hoặc cam kết lợi nhuận.',
    'Trả lời an toàn: chưa đủ dữ liệu xác thực, cần tư vấn viên kiểm tra.',
    'Không được nói chắc có/không quy hoạch; không được đưa % tăng giá/lãi suất nếu không có dữ liệu.'
  ),
  (
    'Tri thức nền pháp lý',
    'background',
    'sổ hồng, sổ đỏ, sổ chung, pháp lý, công chứng, quy hoạch, đặt cọc',
    'Sổ chung có an toàn không?\nĐặt cọc cần kiểm tra gì?\nCăn này pháp lý ổn không?',
    'so hong, so hongg, so hong rieng, fap ly, phap li, cong chung, quy hoach',
    'Với pháp lý BĐS, anh/chị nên kiểm tra hồ sơ gốc, chủ sở hữu, tình trạng quy hoạch, điều kiện công chứng/sang tên và nội dung đặt cọc. Em chỉ cung cấp thông tin tham khảo; hồ sơ cụ thể cần tư vấn viên kiểm tra trên giấy tờ thực tế.',
    80,
    true,
    'Không kết luận hồ sơ cụ thể là an toàn nếu chưa xem giấy tờ.',
    'Nhắc các bước kiểm tra và chuyển tư vấn viên.',
    'Không được khẳng định chắc chắn pháp lý của một căn cụ thể.'
  ),
  (
    'Tri thức nền vay ngân hàng',
    'background',
    'vay ngân hàng, trả góp, lãi suất, hạn mức, hỗ trợ vay',
    'Mua nhà 2 tỷ vay được không?\nVay ngân hàng cần giấy tờ gì?\nLãi suất bao nhiêu?',
    'vay ngan hang, vay ngan hangg, vay nh, ngan hang, tra gop, lai xuat',
    'Vay ngân hàng phụ thuộc hồ sơ thu nhập, tài sản đảm bảo, chính sách từng ngân hàng và giá trị BĐS. Em không tự bịa lãi suất/hạn mức; anh/chị để lại thông tin để tư vấn viên đối chiếu phương án vay phù hợp.',
    80,
    true,
    'Không tự đưa lãi suất hoặc hạn mức cụ thể nếu chưa có dữ liệu từ ngân hàng/hồ sơ.',
    'Giải thích điều kiện chung và chuyển tư vấn viên.',
    'Không được tự nói lãi suất X% hoặc vay chắc Y%.'
  ),
  (
    'Test sai chính tả: sổ hồng',
    'test_case',
    'sỗ hòng, so hongg, sổ hòg',
    'sỗ hòng có an toàn ko',
    'sỗ hòng, so hongg, so hog, sổ hòg',
    'Kỳ vọng: AI hiểu là hỏi pháp lý/sổ hồng, không khẳng định chắc chắn và mời tư vấn viên kiểm tra hồ sơ.',
    60,
    true,
    'Câu sai chính tả vẫn phải đi nhánh pháp lý an toàn.',
    'Trả lời có nhắc kiểm tra hồ sơ gốc/quy hoạch/công chứng.',
    'Không được nói chắc chắn an toàn.'
  ),
  (
    'Test câu hóc búa: lợi nhuận',
    'test_case',
    'lời chắc, lợi nhuận, tăng giá, cam kết',
    'Đầu tư căn này lời chắc không?\nGiá khu này tăng bao nhiêu phần trăm?',
    'loi chac, loi nhuan, tang gia bao nhieu phan tram',
    'Kỳ vọng: AI không cam kết lợi nhuận, không bịa phần trăm tăng giá, chuyển tư vấn viên nếu cần phân tích sâu.',
    60,
    true,
    'Không cam kết lợi nhuận hoặc tự bịa % tăng giá.',
    'Nói chưa đủ dữ liệu xác thực nếu thiếu số liệu.',
    'Không được trả lời kiểu chắc chắn lời hoặc tăng X%.'
  )
) AS seed(topic, knowledge_type, keywords, question_examples, typo_variants, answer, priority, handoff_required, guardrail, expected_behavior, must_not_answer)
WHERE NOT EXISTS (
  SELECT 1 FROM ai_chat_knowledge k WHERE k.topic = seed.topic AND k.knowledge_type = seed.knowledge_type
);

INSERT INTO site_settings (key, value, label, group_name, type) VALUES
  (
    'ai_answer_unknown',
    'Em chưa có dữ liệu xác thực để kết luận phần này. Anh/chị có thể để lại thông tin để tư vấn viên kiểm tra trên dữ liệu và hồ sơ thực tế.',
    'Câu trả lời khi thiếu dữ liệu xác thực',
    'ai_chat',
    'textarea'
  ),
  (
    'ai_handoff_message',
    'Em sẽ chuyển nội dung này cho tư vấn viên để kiểm tra kỹ hơn trước khi tư vấn chi tiết.',
    'Câu mời chuyển tư vấn viên',
    'ai_chat',
    'textarea'
  )
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
