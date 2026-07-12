-- =============================================================================
-- Tin đăng hết hạn: cột expires_at + tự chuyển 'approved' quá hạn → 'expired'
-- =============================================================================
-- Tin duyệt có hạn hiển thị mặc định 60 ngày (admin chỉnh riêng từng tin được).
-- "Thời gian trôi" không phải sự kiện app → dùng pg_cron quét mỗi giờ, chuyển
-- mọi tin approved đã quá expires_at sang status='expired'. Trigger sẵn có
-- (trg_hide_property_on_unpublish) tự ẩn dòng properties khi status rời 'approved'
-- → tin quá hạn biến khỏi trang chủ + trang chi tiết trả 404 (chuẩn SEO), y hệt
-- luồng từ chối. User có thể "Gia hạn" → tin về pending → admin duyệt lại → hạn mới.
-- Idempotent: IF NOT EXISTS + DROP ... IF EXISTS + CREATE OR REPLACE.

-- 1. Cột expires_at (null = không giới hạn; tin cũ trước migration này).
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- 2. Mở rộng ràng buộc status để nhận 'expired'.
ALTER TABLE user_listings DROP CONSTRAINT IF EXISTS user_listings_status_check;
ALTER TABLE user_listings ADD CONSTRAINT user_listings_status_check
  CHECK (status IN ('pending','approved','rejected','expired'));

-- 3. Backfill: tin đã duyệt trước đây mà chưa có hạn → +60 ngày kể từ lúc duyệt
--    (xấp xỉ bằng updated_at). Chỉ đặt cho approved để không đụng tin khác.
UPDATE user_listings
   SET expires_at = COALESCE(updated_at, created_at, now()) + interval '60 days'
 WHERE status = 'approved' AND expires_at IS NULL;

-- 4. Hàm quét: chuyển mọi tin approved đã quá hạn sang 'expired'.
--    SECURITY DEFINER để cron (chạy vai trò postgres) vượt RLS. Cập nhật status
--    kích hoạt trigger ẩn property. Trả số tin đã hết hạn (tiện gọi tay/log).
CREATE OR REPLACE FUNCTION expire_due_listings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  WITH due AS (
    UPDATE user_listings
       SET status = 'expired'
     WHERE status = 'approved'
       AND expires_at IS NOT NULL
       AND expires_at <= now()
    RETURNING 1
  )
  SELECT count(*) INTO n FROM due;
  RETURN n;
END;
$$;

-- Cho phép gọi tay từ admin (JWT authenticated) — dùng cho nút "Quét hết hạn"
-- dự phòng nếu cron chưa chạy. Hàm tự giới hạn phạm vi (chỉ approved quá hạn).
GRANT EXECUTE ON FUNCTION expire_due_listings() TO authenticated;

-- 5. pg_cron: quét mỗi giờ. Bọc trong DO để không lỗi nếu extension chưa bật.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    -- Gỡ job cũ trùng tên (nếu chạy lại migration) rồi tạo lại.
    PERFORM cron.unschedule('expire-due-listings')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-due-listings');
    PERFORM cron.schedule('expire-due-listings', '7 * * * *', 'SELECT expire_due_listings();');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
