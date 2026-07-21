-- =============================================================================
-- Lưu nội dung tin đã render vào nhật ký drip
-- =============================================================================
-- lead_drip_log trước đây chỉ có step + status + detail (mã ngắn), không lưu câu
-- tin thực gửi cho khách. Thêm cột message để admin thấy đúng nội dung đã/sẽ gửi
-- cho từng lead (đã thay biến {ten}/{khu_vuc}/… theo dữ liệu lead).

ALTER TABLE lead_drip_log ADD COLUMN IF NOT EXISTS message text;

NOTIFY pgrst, 'reload schema';
