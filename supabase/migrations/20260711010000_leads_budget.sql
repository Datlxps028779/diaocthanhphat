-- =============================================================================
-- Leads: thêm cột budget (ngân sách / khoảng giá khách quan tâm)
-- =============================================================================
-- Trước đây budget chỉ gửi qua crm-webhook, không lưu vào bảng leads → mất dữ
-- liệu trong CRM. Bổ sung cột để submitLead ghi trực tiếp và xuất được ra CSV.
-- Idempotent. RLS của leads đã siết is_admin() từ trước → cột mới thừa hưởng.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget text;

NOTIFY pgrst, 'reload schema';
