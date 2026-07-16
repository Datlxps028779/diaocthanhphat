-- =============================================================================
-- P7C+: admin xóa phiên chat spam (chọn nhiều)
-- =============================================================================
-- chat_sessions chưa có policy DELETE. Cấp quyền xóa qua RPC SECURITY DEFINER
-- chỉ cho admin; chat_messages + chat_assignments cascade tự xóa theo FK.

CREATE OR REPLACE FUNCTION admin_delete_chat_sessions(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  DELETE FROM chat_sessions WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_delete_chat_sessions(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
