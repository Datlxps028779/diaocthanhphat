-- =============================================================================
-- news_categories — danh mục tin tức động, quản lý từ admin
-- =============================================================================
-- Thay danh sách cứng trong src/lib/newsCategories.ts: admin thêm/sửa/xóa/sắp xếp,
-- đổi màu badge và mô tả SEO. label PHẢI khớp chính xác cột news.category (query lọc
-- bằng .eq('category', label)). Đổi tên danh mục dùng RPC rename_news_category để
-- cascade cập nhật news.category cũ→mới (không để bài mồ côi).
-- Idempotent: IF NOT EXISTS + DROP POLICY IF EXISTS + seed 1 lần.

CREATE TABLE IF NOT EXISTS news_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,                 -- khớp news.category
  slug text NOT NULL UNIQUE,                   -- URL /tin-tuc/danh-muc/{slug}
  badge_color text NOT NULL DEFAULT 'slate',   -- khóa màu: blue|green|amber|purple|red|slate
  seo_description text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_categories_order_idx ON news_categories(order_index);

ALTER TABLE news_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news_categories_select_public" ON news_categories;
CREATE POLICY "news_categories_select_public" ON news_categories FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "news_categories_insert_admin" ON news_categories;
CREATE POLICY "news_categories_insert_admin" ON news_categories FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "news_categories_update_admin" ON news_categories;
CREATE POLICY "news_categories_update_admin" ON news_categories FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "news_categories_delete_admin" ON news_categories;
CREATE POLICY "news_categories_delete_admin" ON news_categories FOR DELETE TO authenticated USING (is_admin());

DROP TRIGGER IF EXISTS update_news_categories_updated_at ON news_categories;
CREATE TRIGGER update_news_categories_updated_at BEFORE UPDATE ON news_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed 5 danh mục hiện có (khớp newsCategories.ts + categoryColors trong NewsPage).
-- KHÔNG seed 'Quy hoạch' (nhãn lệch, không có route). Chỉ seed 1 lần.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM news_categories LIMIT 1) THEN
    RETURN;
  END IF;

  INSERT INTO news_categories (label, slug, badge_color, order_index) VALUES
    ('Thị trường', 'thi-truong', 'blue',   0),
    ('Hạ tầng',    'ha-tang',    'green',  1),
    ('Đầu tư',     'dau-tu',     'amber',  2),
    ('Hướng dẫn',  'huong-dan',  'purple', 3),
    ('Tài chính',  'tai-chinh',  'red',    4);
END $$;

-- Đổi tên danh mục atomic: cập nhật label/slug + cascade news.category cũ→mới.
-- Mô phỏng rename_neighborhood_slug (20260815000000). Chỉ admin được gọi.
CREATE OR REPLACE FUNCTION rename_news_category(p_id uuid, p_old_label text, p_new_label text, p_new_slug text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được đổi tên danh mục tin tức';
  END IF;

  IF p_new_label IS NULL OR btrim(p_new_label) = '' THEN
    RAISE EXCEPTION 'Tên danh mục mới không được để trống';
  END IF;
  IF p_new_slug IS NULL OR btrim(p_new_slug) = '' THEN
    RAISE EXCEPTION 'Slug danh mục mới không được để trống';
  END IF;

  -- Chống trùng label/slug với danh mục khác.
  IF EXISTS (SELECT 1 FROM news_categories WHERE label = p_new_label AND id <> p_id) THEN
    RAISE EXCEPTION 'Tên danh mục "%" đã được dùng cho danh mục khác', p_new_label;
  END IF;
  IF EXISTS (SELECT 1 FROM news_categories WHERE slug = p_new_slug AND id <> p_id) THEN
    RAISE EXCEPTION 'Slug "%" đã được dùng cho danh mục khác', p_new_slug;
  END IF;

  UPDATE news_categories SET label = p_new_label, slug = p_new_slug WHERE id = p_id;

  -- Cascade: các bài đang mang nhãn cũ chuyển sang nhãn mới (tránh bài mồ côi).
  IF p_old_label IS DISTINCT FROM p_new_label THEN
    UPDATE news SET category = p_new_label WHERE category = p_old_label;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION rename_news_category(uuid, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION rename_news_category(uuid, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
