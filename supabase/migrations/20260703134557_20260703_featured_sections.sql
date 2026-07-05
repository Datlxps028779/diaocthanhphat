/*
# Featured Sections – Dynamic Homepage Curation

## Mục đích
Cho phép admin tạo nhiều mục "Tin đăng nổi bật" tùy biến trên trang chủ.
Mỗi mục có thể chạy ở 2 chế độ:
  - **auto**: Tự động lấy BĐS dựa theo bộ lọc (khu vực, loại BĐS, loại giao dịch, sắp xếp).
  - **manual**: Admin chọn thủ công từng BĐS và kéo-thả sắp xếp thứ tự hiển thị.

## Bảng mới

### featured_sections
Cấu hình mỗi mục nổi bật trên trang chủ.
- `title` – Tiêu đề mục (VD: "Đất nền Bình Dương")
- `subtitle` – Mô tả phụ
- `mode` – 'auto' hoặc 'manual'
- `filter_area_id` – (auto) Chỉ lấy BĐS trong khu vực này
- `filter_listing_type` – (auto) 'mua_ban' / 'cho_thue' / '' (tất cả)
- `filter_property_type_id` – (auto) Loại BĐS cụ thể
- `filter_is_hot` – (auto) Chỉ lấy BĐS HOT
- `auto_sort` – (auto) Cách sắp xếp: newest / views / price_asc / price_desc
- `display_count` – Số BĐS hiển thị (1-20)
- `display_style` – 'grid' / 'horizontal'
- `is_active` – Hiển thị/ẩn mục này
- `order_index` – Thứ tự hiển thị trên trang chủ

### featured_section_items
Danh sách BĐS được ghim thủ công cho chế độ manual.
- `section_id` – Thuộc mục nào
- `property_id` – BĐS nào
- `order_index` – Thứ tự trong mục

## Bảo mật
- Public (anon + authenticated) SELECT on both tables.
- Admin-only INSERT/UPDATE/DELETE (authenticated).

## Seed data
Tạo 2 mục mặc định: "Tin đăng nổi bật" (auto, is_featured) và "BĐS Hot" (auto, is_hot).
*/

-- ─── featured_sections ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS featured_sections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                   text NOT NULL,
  subtitle                text,
  mode                    text NOT NULL DEFAULT 'auto'
                          CHECK (mode IN ('auto','manual')),
  -- Auto mode filters
  filter_area_id          uuid REFERENCES areas(id) ON DELETE SET NULL,
  filter_listing_type     text DEFAULT ''
                          CHECK (filter_listing_type IN ('','mua_ban','cho_thue')),
  filter_property_type_id uuid REFERENCES property_types(id) ON DELETE SET NULL,
  filter_is_hot           boolean DEFAULT false,
  filter_is_featured      boolean DEFAULT false,
  auto_sort               text NOT NULL DEFAULT 'newest'
                          CHECK (auto_sort IN ('newest','views','price_asc','price_desc')),
  -- Display
  display_count           integer NOT NULL DEFAULT 8
                          CHECK (display_count BETWEEN 1 AND 20),
  display_style           text NOT NULL DEFAULT 'grid'
                          CHECK (display_style IN ('grid','horizontal')),
  is_active               boolean NOT NULL DEFAULT true,
  order_index             integer NOT NULL DEFAULT 0,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_featured_sections_active
  ON featured_sections(order_index) WHERE is_active = true;

ALTER TABLE featured_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fs_select" ON featured_sections;
CREATE POLICY "fs_select" ON featured_sections
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "fs_insert" ON featured_sections;
CREATE POLICY "fs_insert" ON featured_sections
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "fs_update" ON featured_sections;
CREATE POLICY "fs_update" ON featured_sections
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fs_delete" ON featured_sections;
CREATE POLICY "fs_delete" ON featured_sections
  FOR DELETE TO authenticated USING (true);

-- ─── featured_section_items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS featured_section_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  uuid NOT NULL REFERENCES featured_sections(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(section_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_fsi_section
  ON featured_section_items(section_id, order_index);

ALTER TABLE featured_section_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fsi_select" ON featured_section_items;
CREATE POLICY "fsi_select" ON featured_section_items
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "fsi_insert" ON featured_section_items;
CREATE POLICY "fsi_insert" ON featured_section_items
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "fsi_update" ON featured_section_items;
CREATE POLICY "fsi_update" ON featured_section_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fsi_delete" ON featured_section_items;
CREATE POLICY "fsi_delete" ON featured_section_items
  FOR DELETE TO authenticated USING (true);

-- ─── auto-update updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_featured_sections_updated_at ON featured_sections;
CREATE TRIGGER trg_featured_sections_updated_at
  BEFORE UPDATE ON featured_sections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Seed: 2 default sections ─────────────────────────────────────────────────
INSERT INTO featured_sections
  (title, subtitle, mode, filter_is_featured, filter_is_hot, auto_sort, display_count, display_style, is_active, order_index)
VALUES
  ('Tin đăng nổi bật', 'Các bất động sản được quan tâm nhiều nhất', 'auto', true, false, 'newest', 8, 'grid', true, 0),
  ('BĐS Hot – Giá tốt', 'Cập nhật mới nhất, cơ hội đầu tư không thể bỏ qua', 'auto', false, true, 'views', 4, 'horizontal', true, 1)
ON CONFLICT DO NOTHING;
