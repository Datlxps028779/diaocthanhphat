-- =============================================================================
-- Leads: thêm hẹn gọi lại (follow_up_at) phục vụ nhắc SLA in-app
-- =============================================================================
-- Đợt 4 (CRM workflow): cột follow_up_at để NV hẹn thời điểm gọi lại; LeadsTab
-- tính trạng thái SLA (quá hạn / cần gọi hôm nay) client-side từ cột này +
-- created_at. Không trigger, không cron, không đổi CHECK status.
-- Idempotent. RLS admin của leads sẵn có → cột mới thừa hưởng.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_at timestamptz;

-- Index lọc/sắp theo hẹn gọi lại (danh sách CRM ưu tiên lead cần gọi).
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_at ON leads(follow_up_at);

NOTIFY pgrst, 'reload schema';
