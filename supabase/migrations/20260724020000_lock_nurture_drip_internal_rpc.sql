-- =============================================================================
-- Khóa RPC nội bộ nurture drip
-- =============================================================================
-- `_invoke_nurture_drip()` là helper SECURITY DEFINER cho cron/admin wrapper, không
-- được cho client gọi trực tiếp qua PostgREST RPC. Migration này vá production sau
-- khi foundation đã chạy.

REVOKE EXECUTE ON FUNCTION _invoke_nurture_drip() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION admin_invoke_nurture_drip() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_invoke_nurture_drip() TO authenticated;

NOTIFY pgrst, 'reload schema';
