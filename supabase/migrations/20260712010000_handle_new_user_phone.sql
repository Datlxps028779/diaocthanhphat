-- =============================================================================
-- Sửa trigger tạo profile khi đăng ký: lưu thêm phone từ user metadata
-- =============================================================================
-- Trước đây handle_new_user() chỉ lưu display_name → số điện thoại nhập lúc đăng ký
-- bị mất (app upsert phone ở client bị RLS chặn khi email confirm bật). Nay signUp
-- gửi phone qua raw_user_meta_data, trigger đọc luôn (chạy SECURITY DEFINER server-side).
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, display_name, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
