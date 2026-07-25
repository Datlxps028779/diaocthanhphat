-- =============================================================================
-- menu_items — menu điều hướng động (kiểu WordPress), quản lý từ admin
-- =============================================================================
-- Thay menu hardcode trong navigation.ts: admin thêm/sửa/xóa/sắp xếp/lồng cấp.
-- Lồng đệ quy qua parent_id tự tham chiếu. item_type='dynamic_areas' là mục
-- "động": FE tự bung danh sách khu vực thật (không cần nhập tay từng khu vực).
-- Idempotent: IF NOT EXISTS + DROP POLICY IF EXISTS.

CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text,                                       -- null khi item_type='dynamic_areas'
  item_type text NOT NULL DEFAULT 'link',         -- 'link' | 'dynamic_areas'
  open_new_tab boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_items_parent_idx ON menu_items(parent_id);
CREATE INDEX IF NOT EXISTS menu_items_order_idx ON menu_items(order_index);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_items_select_public" ON menu_items;
CREATE POLICY "menu_items_select_public" ON menu_items FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "menu_items_insert_admin" ON menu_items;
CREATE POLICY "menu_items_insert_admin" ON menu_items FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "menu_items_update_admin" ON menu_items;
CREATE POLICY "menu_items_update_admin" ON menu_items FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "menu_items_delete_admin" ON menu_items;
CREATE POLICY "menu_items_delete_admin" ON menu_items FOR DELETE TO authenticated USING (is_admin());

DROP TRIGGER IF EXISTS update_menu_items_updated_at ON menu_items;
CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed menu hiện tại để admin thấy + sửa, không mất menu khi deploy. Chỉ seed 1 lần
-- (bỏ qua nếu đã có dữ liệu — tránh nhân đôi khi chạy lại migration).
DO $$
DECLARE
  v_regions uuid;
  v_news uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM menu_items LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO menu_items (label, url, item_type, order_index) VALUES ('Trang chủ', '/', 'link', 0);
  INSERT INTO menu_items (label, url, item_type, order_index) VALUES ('Mua bán', '/mua-ban', 'link', 1);
  INSERT INTO menu_items (label, url, item_type, order_index) VALUES ('Cho thuê', '/cho-thue', 'link', 2);

  INSERT INTO menu_items (label, url, item_type, order_index) VALUES ('Tìm theo khu vực', '/khu-vuc', 'link', 3)
    RETURNING id INTO v_regions;
  INSERT INTO menu_items (parent_id, label, url, item_type, order_index) VALUES (v_regions, 'Tất cả khu vực', '/khu-vuc', 'link', 0);
  INSERT INTO menu_items (parent_id, label, url, item_type, order_index) VALUES (v_regions, 'Khu dân cư', '/khu-dan-cu', 'link', 1);
  INSERT INTO menu_items (parent_id, label, url, item_type, order_index) VALUES (v_regions, 'Dữ liệu giá', '/du-lieu-gia', 'link', 2);
  INSERT INTO menu_items (parent_id, label, url, item_type, order_index) VALUES (v_regions, 'Danh sách khu vực', NULL, 'dynamic_areas', 3);

  INSERT INTO menu_items (label, url, item_type, order_index) VALUES ('Dự án', '/du-an', 'link', 4);
  INSERT INTO menu_items (label, url, item_type, order_index) VALUES ('Đầu tư', '/dau-tu', 'link', 5);
  INSERT INTO menu_items (label, url, item_type, order_index) VALUES ('Định giá', '/dinh-gia', 'link', 6);

  INSERT INTO menu_items (label, url, item_type, order_index) VALUES ('Tin tức', '/tin-tuc', 'link', 7)
    RETURNING id INTO v_news;
  INSERT INTO menu_items (parent_id, label, url, item_type, order_index) VALUES (v_news, 'Tất cả tin tức', '/tin-tuc', 'link', 0);
  INSERT INTO menu_items (parent_id, label, url, item_type, order_index) VALUES (v_news, 'Kiến thức', '/kien-thuc', 'link', 1);

  INSERT INTO menu_items (label, url, item_type, order_index) VALUES ('Về chúng tôi', '/ve-chung-toi', 'link', 8);
END $$;

NOTIFY pgrst, 'reload schema';
