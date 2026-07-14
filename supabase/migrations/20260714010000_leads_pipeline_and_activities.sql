-- =============================================================================
-- Leads: pipeline chăm sóc nhiều giai đoạn + bảng lịch sử tương tác
-- =============================================================================
-- Đợt 4.1 (CRM chăm sóc): mở rộng status thành pipeline 6 giai đoạn BĐS
-- (new→contacted→nurturing→viewing→negotiating→won/lost) + bảng lead_activities
-- ghi nhật ký tương tác theo thời gian (tạo/ghi chú/gọi/đổi giai đoạn/hẹn gọi).
-- Idempotent. RLS lead_activities mirror leads (admin-only qua is_admin()).

-- 1. Dọn giá trị cũ 'closed' → 'won' TRƯỚC khi siết CHECK (tránh vi phạm ràng buộc).
UPDATE leads SET status = 'won' WHERE status = 'closed';

-- 2. Mở rộng ràng buộc status thành pipeline 6 giai đoạn (won/lost là terminal).
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new','contacted','nurturing','viewing','negotiating','won','lost'));

-- 3. Bảng lịch sử tương tác — mỗi dòng là 1 lần "chạm" vào lead.
CREATE TABLE IF NOT EXISTS lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('created','note','call','stage_change','follow_up')),
  body text,
  author text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id, created_at DESC);

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- RLS: admin-only (mirror leads). Không public — chỉ nội bộ chăm sóc.
DROP POLICY IF EXISTS "auth_select_lead_activities" ON lead_activities;
CREATE POLICY "auth_select_lead_activities" ON lead_activities FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "auth_insert_lead_activities" ON lead_activities;
CREATE POLICY "auth_insert_lead_activities" ON lead_activities FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_lead_activities" ON lead_activities;
CREATE POLICY "auth_delete_lead_activities" ON lead_activities FOR DELETE
  TO authenticated USING (is_admin());

NOTIFY pgrst, 'reload schema';
