-- Chọn danh mục xuất hiện trong khối chuyên mục trên /tin-tuc.
-- Không ảnh hưởng tab lọc, route, sitemap hay danh mục gán cho bài viết.
ALTER TABLE news_categories
  ADD COLUMN IF NOT EXISTS show_in_news_sections boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
