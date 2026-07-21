-- =============================================================================
-- Nurture drip — bước động + luật lọc cấu hình từ admin + chuẩn bị đa kênh
-- =============================================================================
-- Trước migration này các bước drip (d1/d3/d7), số ngày và nội dung tin đều
-- hard-code trong Edge Function. Đưa xuống DB để admin sửa được nội dung, số
-- ngày, kênh, bật/tắt và thêm/bớt bước; đồng thời cho admin chỉnh luật lọc cơ
-- bản (giai đoạn lead nào được nuôi + bắt buộc SĐT). Edge Function + frontend
-- đọc chung config từ đây.

-- 1) Bảng bước động ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS nurture_drip_step (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delay_days       int  NOT NULL CHECK (delay_days >= 0),
  channel          text NOT NULL DEFAULT 'zalo' CHECK (channel IN ('zalo','sms','email')),
  message_template text NOT NULL,
  enabled          boolean NOT NULL DEFAULT true,
  sort_order       int  NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nurture_drip_step_order ON nurture_drip_step(sort_order, delay_days);

ALTER TABLE nurture_drip_step ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nds_select_admin" ON nurture_drip_step;
CREATE POLICY "nds_select_admin" ON nurture_drip_step FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "nds_insert_admin" ON nurture_drip_step;
CREATE POLICY "nds_insert_admin" ON nurture_drip_step FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "nds_update_admin" ON nurture_drip_step;
CREATE POLICY "nds_update_admin" ON nurture_drip_step FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "nds_delete_admin" ON nurture_drip_step;
CREATE POLICY "nds_delete_admin" ON nurture_drip_step FOR DELETE TO authenticated
  USING (is_admin());

-- Seed 3 bước mặc định = đúng d1/d3/d7 + nội dung đang chạy (chỉ khi bảng rỗng).
INSERT INTO nurture_drip_step (delay_days, channel, message_template, enabled, sort_order)
SELECT * FROM (VALUES
  (1, 'zalo', '{ten} ơi, Dia Oc Thanh Phat vẫn đang giữ thông tin nhu cầu BĐS của mình. Nếu cần xem thêm lựa chọn phù hợp, đội ngũ tư vấn sẵn sàng hỗ trợ.', true, 0),
  (3, 'zalo', '{ten} ơi, thị trường {khu_vuc} có thêm nhiều lựa chọn mới theo nhu cầu của mình. Trả lời tin nhắn này nếu mình muốn được lọc nhanh các căn phù hợp.', true, 1),
  (7, 'zalo', '{ten} ơi, nếu kế hoạch mua/thuê BĐS vẫn còn, Dia Oc Thanh Phat có thể rà lại {ngan_sach}, pháp lý và khu vực phù hợp để mình không mất thời gian xem sai căn.', true, 2)
) AS v(delay_days, channel, message_template, enabled, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM nurture_drip_step);

-- 2) Mở rộng luật lọc trong nurture_drip_config ------------------------------
ALTER TABLE nurture_drip_config
  ADD COLUMN IF NOT EXISTS eligible_statuses text[] NOT NULL DEFAULT '{new,contacted,nurturing,viewing,negotiating}';
ALTER TABLE nurture_drip_config
  ADD COLUMN IF NOT EXISTS require_phone boolean NOT NULL DEFAULT true;

-- 3) Nới lead_drip_log để nhận step.id (uuid dạng text) + kênh động -----------
-- step giờ lưu id của bước (bền vững dù đổi nội dung). Rows lịch sử 'd1/d3/d7'
-- giữ nguyên, chỉ bỏ ràng buộc giá trị cứng.
ALTER TABLE lead_drip_log DROP CONSTRAINT IF EXISTS lead_drip_log_step_check;
ALTER TABLE lead_drip_log DROP CONSTRAINT IF EXISTS lead_drip_log_channel_check;
ALTER TABLE lead_drip_log
  ADD CONSTRAINT lead_drip_log_channel_check CHECK (channel IN ('zalo','sms','email'));

NOTIFY pgrst, 'reload schema';
