-- =============================================================================
-- Chuẩn hoá URL ảnh còn sót: nội dung bài viết + tin khách tự đăng
-- =============================================================================
-- Đợt trước chuẩn hoá properties.image_url/images, news.image_url và user_media.url,
-- nhưng bỏ sót hai chỗ:
--
-- 1. news.content — ảnh chèn trong thân bài (trình soạn thảo lưu thẳng URL storage).
--    Có bài đang chứa 11 ảnh trỏ bucket admin-uploads (private) nên vỡ ở cả trang
--    công khai lẫn màn quản trị.
-- 2. user_listings.image_url/images — tin khách tự đăng, admin xem ở tab duyệt tin.
--
-- regexp_replace với cờ 'g' đổi mọi URL trong cùng một chuỗi HTML, giữ nguyên phần
-- còn lại của nội dung. Idempotent: chỉ khớp dòng còn marker storage.

UPDATE news
SET content = regexp_replace(
  content,
  'https?://[^"'' ]+/storage/v1/object/public/',
  'https://chonhaviet.com/hinh-anh/',
  'g'
)
WHERE content LIKE '%/storage/v1/object/public/%';

UPDATE user_listings
SET image_url = 'https://chonhaviet.com/hinh-anh/' ||
  split_part(image_url, '/storage/v1/object/public/', 2)
WHERE image_url LIKE '%/storage/v1/object/public/%';

UPDATE user_listings
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
