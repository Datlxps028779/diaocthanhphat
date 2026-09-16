-- Chỉ đọc. Đối chiếu kết quả với preflight, không với giá trị hardcode cũ.
-- Quyền bảng không thay thế điều kiện RLS; cần xem cả policy USING/WITH CHECK.
BEGIN TRANSACTION READ ONLY;

SELECT EXISTS (SELECT 1 FROM public.page_sections WHERE id = 'timeline') AS timeline_present;

SELECT id, label, is_visible, order_index, settings, updated_at
FROM public.page_sections
ORDER BY order_index, id;

SELECT relrowsecurity AS rls_enabled
FROM pg_class WHERE oid = 'public.page_sections'::regclass;

SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'page_sections'
ORDER BY policyname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'page_sections'
ORDER BY grantee, privilege_type;

ROLLBACK;
