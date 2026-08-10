-- Cột external_id cho tin đăng + bài viết tạo qua API (make.com).
--
-- Vì sao cần: make.com tự retry khi timeout hoặc lỗi mạng. Không có chốt chống
-- trùng thì một tin bị đăng 2-3 lần. Client gửi kèm external_id (mã của họ),
-- route kiểm trùng trước khi insert và trả duplicate:true nếu đã có.
--
-- Partial unique index (WHERE NOT NULL) chứ không phải UNIQUE thường: tin/bài tạo
-- tay trong admin có external_id = NULL, mà UNIQUE thường ở Postgres cho phép
-- nhiều NULL nên vẫn chạy — dùng partial để nói rõ ý định và index gọn hơn.
--
-- Idempotent: IF NOT EXISTS ở cả cột và index.

ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE news          ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_listings_external_id
  ON user_listings(external_id) WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_news_external_id
  ON news(external_id) WHERE external_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
