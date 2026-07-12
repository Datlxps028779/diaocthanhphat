-- =============================================================================
-- Đợt 5: Khu vực 3 cấp — thêm bảng wards (Phường/Xã) + cột ward trên listings
-- =============================================================================
-- Cấp 3 của phân cấp vị trí: areas (Tỉnh) → districts (Quận/Huyện) → wards (Phường/Xã).
-- Bám đúng khuôn districts: bảng nguồn cho dropdown cascade + cột text để lưu/lọc.
-- (district đang lưu dạng text 'district', ward cũng lưu text 'ward' cho nhất quán;
-- cột district_id/ward_id FK không dùng trong query — giữ mô hình text hiện có.)
-- Idempotent: IF NOT EXISTS + DROP POLICY IF EXISTS. Seed dữ liệu tách file riêng.

CREATE TABLE IF NOT EXISTS wards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id uuid REFERENCES districts(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wards_slug_idx ON wards(slug);
CREATE INDEX IF NOT EXISTS wards_district_idx ON wards(district_id);

ALTER TABLE wards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wards_select_public" ON wards;
CREATE POLICY "wards_select_public" ON wards FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "wards_insert_admin" ON wards;
CREATE POLICY "wards_insert_admin" ON wards FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "wards_update_admin" ON wards;
CREATE POLICY "wards_update_admin" ON wards FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "wards_delete_admin" ON wards;
CREATE POLICY "wards_delete_admin" ON wards FOR DELETE TO authenticated USING (is_admin());

-- Cột ward (text) để listing lưu + bộ lọc khớp chính xác (giống district).
ALTER TABLE properties    ADD COLUMN IF NOT EXISTS ward text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS ward text;

NOTIFY pgrst, 'reload schema';
