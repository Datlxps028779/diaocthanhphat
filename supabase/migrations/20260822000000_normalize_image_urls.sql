-- =============================================================================
-- Chuẩn hoá URL ảnh: URL storage thô → đường dẫn dưới tên miền site
-- =============================================================================
-- Ảnh nằm trong bucket private admin-uploads (dùng chung với tài liệu nội bộ), nên
-- URL /storage/v1/object/public/... trả 400 và ảnh không hiển thị. Route
-- /hinh-anh/{bucket}/{path} đọc storage bằng service_role rồi trả về dưới tên miền
-- site, nhưng chỉ đỡ được những URL đã ở dạng /hinh-anh/.
--
-- 185 URL trong DB vẫn là dạng thô (properties 85, news 3, user_media 97) vì được
-- lưu trước khi có route. Hơn 25 chỗ render đọc thẳng image_url nên vá từng chỗ sẽ
-- bỏ sót; chuẩn hoá tại nguồn là cách duy nhất phủ hết.
--
-- Idempotent: chỉ đổi dòng còn chứa marker storage; chạy lại không tác dụng phụ.

-- Ảnh đại diện tin đăng
UPDATE properties
SET image_url = 'https://chonhaviet.com/hinh-anh/' ||
  split_part(image_url, '/storage/v1/object/public/', 2)
WHERE image_url LIKE '%/storage/v1/object/public/%';

-- Thư viện ảnh tin đăng (mảng text)
UPDATE properties
SET images = (
  SELECT array_agg(
    CASE WHEN img LIKE '%/storage/v1/object/public/%'
      THEN 'https://chonhaviet.com/hinh-anh/' || split_part(img, '/storage/v1/object/public/', 2)
      ELSE img
    END
    ORDER BY idx
  )
  FROM unnest(images) WITH ORDINALITY AS t(img, idx)
)
WHERE images IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM unnest(images) AS img
    WHERE img LIKE '%/storage/v1/object/public/%'
  );

-- Ảnh bài viết
UPDATE news
SET image_url = 'https://chonhaviet.com/hinh-anh/' ||
  split_part(image_url, '/storage/v1/object/public/', 2)
WHERE image_url LIKE '%/storage/v1/object/public/%';

-- Thư viện ảnh trong admin (kho ảnh đã upload)
UPDATE user_media
SET url = 'https://chonhaviet.com/hinh-anh/' ||
  split_part(url, '/storage/v1/object/public/', 2)
WHERE url LIKE '%/storage/v1/object/public/%';
