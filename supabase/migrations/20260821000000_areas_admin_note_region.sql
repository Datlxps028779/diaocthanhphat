-- =============================================================================
-- Ghi chú đơn vị hành chính sau Nghị quyết 202/2025/QH15 (hiệu lực 01/07/2025)
-- =============================================================================
-- Cả nước còn 34 đơn vị cấp tỉnh. Bốn khu vực đang vận hành của site chịu ảnh
-- hưởng: Bình Dương sáp nhập vào TP.HCM, Bình Phước sáp nhập vào Đồng Nai.
--
-- CHỦ Ý KHÔNG đổi cấu trúc areas/URL: 12/14 tin đang hoạt động nằm ở Bình Dương
-- và toàn bộ tín hiệu SEO đã tích luỹ theo slug binh-duong. Gộp slug lúc này sẽ
-- vứt bỏ tín hiệu đó để đổi lấy tính đúng hành chính mà người tìm nhà không dùng
-- (khách vẫn gõ "nhà đất Bình Dương"). Ở đây chỉ bổ sung metadata mô tả để trang
-- khu vực nói đúng hiện trạng pháp lý; việc gộp/redirect để ngỏ cho sau này.
--
-- region: phục vụ nhóm khu vực theo miền trên UI (Bắc/Trung/Nam).
-- admin_note: câu ghi chú hiển thị cho khách, chỉ điền khi đơn vị có thay đổi.
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE theo slug.

ALTER TABLE areas ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS admin_note text;

COMMENT ON COLUMN areas.region IS 'Miền địa lý (bac/trung/nam) để nhóm khu vực trên UI.';
COMMENT ON COLUMN areas.admin_note IS 'Ghi chú hiện trạng hành chính sau sáp nhập 2025, hiển thị trên trang khu vực.';

UPDATE areas SET region = 'nam' WHERE slug IN ('tp-hcm', 'binh-duong', 'dong-nai', 'binh-phuoc');

UPDATE areas
SET admin_note = 'Từ 01/07/2025, tỉnh Bình Dương đã sáp nhập vào Thành phố Hồ Chí Minh theo Nghị quyết 202/2025/QH15. Tên gọi Bình Dương được giữ trên website để thuận tiện tìm kiếm.'
WHERE slug = 'binh-duong';

UPDATE areas
SET admin_note = 'Từ 01/07/2025, tỉnh Bình Phước đã sáp nhập vào tỉnh Đồng Nai theo Nghị quyết 202/2025/QH15. Tên gọi Bình Phước được giữ trên website để thuận tiện tìm kiếm.'
WHERE slug = 'binh-phuoc';

UPDATE areas
SET admin_note = 'Từ 01/07/2025, Thành phố Hồ Chí Minh được mở rộng trên cơ sở hợp nhất với tỉnh Bình Dương và tỉnh Bà Rịa - Vũng Tàu theo Nghị quyết 202/2025/QH15.'
WHERE slug = 'tp-hcm';

UPDATE areas
SET admin_note = 'Từ 01/07/2025, tỉnh Đồng Nai được mở rộng trên cơ sở hợp nhất với tỉnh Bình Phước theo Nghị quyết 202/2025/QH15.'
WHERE slug = 'dong-nai';
