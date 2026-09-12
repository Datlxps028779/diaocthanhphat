-- ─────────────────────────────────────────────────────────────────────────────
-- DỌN TRANG KHU DÂN CƯ MỒ CÔI + CHUẨN HÓA TÊN/SLUG "Lê Phong 3"
-- Chạy trong Supabase Dashboard → SQL Editor. Chạy TỪNG BƯỚC, đọc kết quả trước
-- khi sang bước sau. An toàn: mọi thao tác tra theo slug, không hardcode UUID.
--
-- Bối cảnh:
--   • Khu dân cư thật hiện tại: slug = 'kdc-le-phong-3-gia-nha-dat-xung-quanh'
--     tên  = 'Khu dân cư Lê Phong 3: Giá nhà đất và các khu dân cư xung quanh'
--     → tên/slug bị nhồi từ khóa, cần chuẩn hóa về 'Lê Phong 3' / 'kdc-le-phong-3'.
--   • Trang container MỒ CÔI: managed_pages.slug = 'khu-dan-cu:kdc-le-phong-3'
--     (is_active=false, KHÔNG còn khu dân cư nào mang slug kdc-le-phong-3)
--     → phải XÓA trước, nếu không RPC rename sẽ đụng slug trùng.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── BƯỚC 0 — Soi hiện trạng (chỉ đọc, không đổi gì) ──────────────────────────
SELECT id, name, slug, ward_id
FROM neighborhoods
WHERE slug LIKE 'kdc-le-phong-3%';

SELECT slug, title, is_system, is_active
FROM managed_pages
WHERE slug LIKE 'khu-dan-cu:kdc-le-phong-3%'
ORDER BY slug;
-- Kỳ vọng: 1 dòng neighborhoods (slug ...-gia-nha-dat-xung-quanh) và 2 dòng
-- managed_pages: 'khu-dan-cu:kdc-le-phong-3-gia-nha-dat-xung-quanh' (đang dùng)
-- + 'khu-dan-cu:kdc-le-phong-3' (MỒ CÔI, cần xóa).


-- ── BƯỚC 1 — Xóa trang container mồ côi ─────────────────────────────────────
-- CHỈ xóa đúng trang có hậu tố trần 'kdc-le-phong-3' (không đụng bản
-- '...-gia-nha-dat-xung-quanh' đang gắn với khu dân cư thật). page_blocks con
-- tự xóa theo ON DELETE CASCADE.
DELETE FROM managed_pages
WHERE slug = 'khu-dan-cu:kdc-le-phong-3';
-- Kỳ vọng: DELETE 1.


-- ── BƯỚC 2 — Chuẩn hóa SLUG qua RPC cascade (đồng bộ properties/user_listings/
--            trang container). RPC tự tra theo id nên lấy id từ slug hiện tại. ──
SELECT rename_neighborhood_slug(
  (SELECT id FROM neighborhoods WHERE slug = 'kdc-le-phong-3-gia-nha-dat-xung-quanh'),
  'kdc-le-phong-3-gia-nha-dat-xung-quanh',  -- p_old
  'kdc-le-phong-3'                          -- p_new
);
-- Kỳ vọng: trả về (void, không lỗi). Sau bước này:
--   neighborhoods.slug            → 'kdc-le-phong-3'
--   properties.neighborhood_slug  → 'kdc-le-phong-3' (nếu có tin đã gắn)
--   managed_pages.slug            → 'khu-dan-cu:kdc-le-phong-3'


-- ── BƯỚC 3 — Chuẩn hóa TÊN hiển thị (RPC chỉ đổi slug, không đổi name) ───────
UPDATE neighborhoods
SET name = 'Lê Phong 3'
WHERE slug = 'kdc-le-phong-3';
-- Kỳ vọng: UPDATE 1. (Đổi tên KHÔNG cascade — name chỉ để hiển thị, không phải khóa.)

-- Đồng bộ tiêu đề trang container cho khớp tên mới (tùy chọn, cho gọn admin):
UPDATE managed_pages
SET title = 'Khu dân cư Lê Phong 3'
WHERE slug = 'khu-dan-cu:kdc-le-phong-3';


-- ── BƯỚC 4 — Kiểm tra lại (chỉ đọc) ─────────────────────────────────────────
SELECT id, name, slug FROM neighborhoods WHERE slug LIKE 'kdc-le-phong-3%';
SELECT slug, title, is_active FROM managed_pages WHERE slug LIKE 'khu-dan-cu:kdc-le-phong-3%';
-- Kỳ vọng cuối: neighborhoods 1 dòng (name='Lê Phong 3', slug='kdc-le-phong-3');
-- managed_pages 1 dòng ('khu-dan-cu:kdc-le-phong-3'). KHÔNG còn dòng mồ côi.
