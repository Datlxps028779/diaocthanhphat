-- Nguồn tham khảo (citations) cho bài viết news — chuẩn SEO/GEO (schema.org citation).
-- Mảng {title, url}. Dùng để render mục "Nguồn tham khảo" cuối bài + nhúng JSON-LD
-- citation (CreativeWork). Tăng E-E-A-T, giúp Google/AI tin cậy và dẫn nguồn.
ALTER TABLE news ADD COLUMN IF NOT EXISTS citations jsonb;
NOTIFY pgrst, 'reload schema';
