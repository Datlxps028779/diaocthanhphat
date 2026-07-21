-- Admin đọc được TẤT CẢ bài news, kể cả nháp (is_published=false).
-- Trước đây bảng news chỉ có 1 policy SELECT là news_select_public (is_published=true),
-- nên admin qua browser client (RLS theo JWT) KHÔNG thấy bài nháp. Bài nháp tạo bằng
-- AI (insert service-role) lưu OK nhưng bị RLS lọc khi hiển thị. Migration hardening
-- trước chỉ thêm policy admin cho insert/update/delete, thiếu SELECT — vá ở đây.
--
-- Policy permissive được OR với nhau: public vẫn chỉ thấy bài đã đăng, admin thấy hết.
DROP POLICY IF EXISTS "news_select_admin" ON news;
CREATE POLICY "news_select_admin" ON news FOR SELECT TO authenticated USING (is_admin());
