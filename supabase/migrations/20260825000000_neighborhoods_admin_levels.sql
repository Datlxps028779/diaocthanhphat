-- =============================================================================
-- Khu dân cư: thêm cấp Tỉnh + Quận/Huyện
-- =============================================================================
-- Bảng neighborhoods trước đây chỉ có ward_id, nên khu dân cư buộc phải gắn vào một
-- phường/xã cụ thể. Tỉnh nào chưa có dữ liệu cấp xã thì không thêm được khu dân cư,
-- và những khu trải rộng nhiều xã (khu công nghiệp) không có chỗ để gắn.
--
-- Thêm area_id + district_id, cả hai nullable: tỉnh là cấp tối thiểu, huyện và xã
-- tùy chọn. ward_id giữ nguyên — dữ liệu cũ vẫn dùng được và RAG index đang đọc cột
-- này (20260814000000_rag_index.sql).
--
-- Backfill suy ngược từ ward_id có sẵn: ward → district → area. Khu nào ward_id
-- rỗng thì để trống, admin gán sau; không suy đoán.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + backfill chỉ ghi vào ô còn rỗng.

ALTER TABLE neighborhoods ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas(id) ON DELETE SET NULL;
ALTER TABLE neighborhoods ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES districts(id) ON DELETE SET NULL;

COMMENT ON COLUMN neighborhoods.area_id IS 'Tỉnh/thành của khu dân cư — cấp bắt buộc khi tạo mới.';
COMMENT ON COLUMN neighborhoods.district_id IS 'Quận/huyện — tùy chọn, để trống khi khu trải rộng nhiều huyện.';

-- Sửa một khu bị gán sai xã trước khi suy ngược cấp trên: "Việt Sing" mô tả rõ thuộc
-- phường An Phú, Thuận An, Bình Dương nhưng đang trỏ vào phường An Phú của Thủ Đức,
-- TP.HCM. Có hai phường cùng tên nên ô chọn cũ (chỉ hiện tên xã kèm huyện, không hiện
-- tỉnh) rất dễ chọn nhầm — đây cũng là lý do form được nâng lên ba cấp.
-- Chỉ sửa khi đúng khu đang trỏ sai, để chạy lại không ghi đè lựa chọn về sau.
UPDATE neighborhoods
SET ward_id = (SELECT id FROM wards WHERE slug = 'binh-duong-thuan-an-an-phu')
WHERE slug = 'khu-dan-cu-viet-sing'
  AND ward_id = (SELECT id FROM wards WHERE slug = 'tp-hcm-thu-duc-an-phu');

UPDATE neighborhoods n
SET district_id = w.district_id
FROM wards w
WHERE n.ward_id = w.id AND n.district_id IS NULL;

UPDATE neighborhoods n
SET area_id = d.area_id
FROM districts d
WHERE n.district_id = d.id AND n.area_id IS NULL;

CREATE INDEX IF NOT EXISTS neighborhoods_area_idx ON neighborhoods(area_id);
CREATE INDEX IF NOT EXISTS neighborhoods_district_idx ON neighborhoods(district_id);
