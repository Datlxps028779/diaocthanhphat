-- =============================================================================
-- P7C+: khách bấm "gặp nhân viên" có thể để lại tên/SĐT (KHÔNG bắt buộc)
-- =============================================================================
-- Mở rộng public_request_staff nhận thêm tên/SĐT tùy chọn. Drop bản 2 tham số cũ
-- để tránh nhập nhằng overload khi client gọi bằng named params.

DROP FUNCTION IF EXISTS public_request_staff(uuid, text);

CREATE OR REPLACE FUNCTION public_request_staff(
  p_session_id uuid,
  p_visitor_token text,
  p_visitor_name text DEFAULT NULL,
  p_visitor_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_access_public_chat(p_session_id, p_visitor_token) THEN
    RAISE EXCEPTION 'Invalid chat session';
  END IF;
  UPDATE chat_sessions
  SET wants_staff = true,
      visitor_name = COALESCE(NULLIF(btrim(p_visitor_name), ''), visitor_name),
      visitor_phone = COALESCE(NULLIF(btrim(p_visitor_phone), ''), visitor_phone),
      updated_at = now()
  WHERE id = p_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public_request_staff(uuid, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
