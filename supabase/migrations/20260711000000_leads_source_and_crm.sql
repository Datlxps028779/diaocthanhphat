-- =============================================================================
-- Leads: thêm nguồn lead (tracking) + trường CRM (ghi chú, gán nhân viên)
-- =============================================================================
-- Đợt 3.1: cột source để đo nguồn lead (form chi tiết, gate SĐT, contact modal...).
-- Đợt 3.3: note (ghi chú nội bộ) + assigned_to (gán nhân viên phụ trách).
-- Idempotent. RLS của leads đã siết is_admin() từ trước → cột mới thừa hưởng.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS source      text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS note        text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to text;

-- Index lọc theo nguồn (báo cáo nguồn lead trong admin).
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);

NOTIFY pgrst, 'reload schema';
