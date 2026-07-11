-- =============================================================================
-- Đợt 4: chuẩn hoá pháp lý cho tính năng "Danh mục nhanh" lọc theo legal_status
-- =============================================================================
-- Danh sách pháp lý mới (nguồn chân lý ở src/lib/legalOptions.ts):
--   Sổ hồng · Sổ chung · Hợp đồng mua bán · Chưa có sổ
-- Quyết định của user: bỏ "Sổ đỏ", đổi "Giấy tay" → "Sổ chung". Dữ liệu hiện tại
-- là demo → gom toàn bộ legal_status về "Sổ hồng" cho sạch, không ảnh hưởng gì.
-- Bộ lọc khớp CHÍNH XÁC text legal_status nên dữ liệu phải trùng danh sách mới.
-- Idempotent: chạy lại chỉ set lại cùng giá trị, an toàn.

UPDATE properties    SET legal_status = 'Sổ hồng' WHERE legal_status IS NOT NULL;
UPDATE projects      SET legal_status = 'Sổ hồng' WHERE legal_status IS NOT NULL;
UPDATE user_listings SET legal_status = 'Sổ hồng' WHERE legal_status IS NOT NULL;
