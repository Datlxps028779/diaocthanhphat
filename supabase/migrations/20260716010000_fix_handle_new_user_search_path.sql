-- =============================================================================
-- VÁ LẠI LỖI "Database error saving new user" (đăng ký + tạo NV đều 500)
-- =============================================================================
-- Nguyên nhân: handle_new_user() từng được vá bằng SET search_path=public
-- (PHASE_C_fix_auth.sql). Nhưng migration 20260712010000_handle_new_user_phone
-- tạo lại hàm để thêm cột phone và LÀM MẤT `SET search_path` → tái tạo đúng lỗi
-- cũ: khi GoTrue tạo user, search_path rỗng → không thấy bảng profiles → trigger
-- vỡ → cả việc tạo user vỡ. Hệ quả: khách không đăng ký được, admin không tạo
-- được tài khoản nhân viên.
-- Fix: giữ nguyên hành vi lưu phone, chỉ định rõ public.profiles + SET search_path.
-- Idempotent: CREATE OR REPLACE.
-- =============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Đảm bảo trigger tồn tại (idempotent).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

NOTIFY pgrst, 'reload schema';
