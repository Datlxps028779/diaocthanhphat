-- =============================================================================
-- P7C: chỉ đồng bộ/chia phiên chat khi khách CHỦ ĐỘNG yêu cầu tư vấn
-- =============================================================================
-- Trước đây mọi phiên chat (kể cả hỏi tham khảo) đều được tạo/route. Nay khách chỉ
-- được chia cho nhân viên khi: để lại SĐT (lead) HOẶC bấm "gặp nhân viên" (wants_staff).
-- Chat tham khảo giữ ở client, không tạo phiên, không bắn về admin/staff.

ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS wants_staff boolean DEFAULT false NOT NULL;

-- Public: khách bấm "gặp nhân viên trực chat" → đánh dấu phiên cần người thật.
CREATE OR REPLACE FUNCTION public_request_staff(p_session_id uuid, p_visitor_token text)
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
  SET wants_staff = true, updated_at = now()
  WHERE id = p_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public_request_staff(uuid, text) TO anon, authenticated;

-- Route: cho phép khi đã có lead / SĐT / khách chủ động xin gặp nhân viên.
CREATE OR REPLACE FUNCTION route_chat_session(p_session_id uuid, p_visitor_token text DEFAULT NULL)
RETURNS TABLE(assigned_user_id uuid, admin_attention boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_ok boolean;
BEGIN
  IF NOT (is_admin() OR can_access_public_chat(p_session_id, p_visitor_token)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT (lead_id IS NOT NULL
          OR NULLIF(btrim(COALESCE(visitor_phone, '')), '') IS NOT NULL
          OR wants_staff)
  INTO v_ok
  FROM chat_sessions
  WHERE id = p_session_id;

  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'Consultation required before routing';
  END IF;

  SELECT p.id INTO v_user
  FROM profiles p
  LEFT JOIN chat_staff_capacity c ON c.user_id = p.id
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS active_count
    FROM chat_assignments ca
    JOIN chat_sessions cs ON cs.id = ca.session_id
    WHERE ca.user_id = p.id AND cs.status = 'active'
  ) load ON true
  WHERE p.role = 'staff'
    AND COALESCE(c.is_available, true)
    AND COALESCE(load.active_count, 0) < COALESCE(c.max_active_sessions, 3)
  ORDER BY COALESCE(load.active_count, 0) ASC, c.last_assigned_at ASC NULLS FIRST, p.created_at ASC
  LIMIT 1;

  IF v_user IS NULL THEN
    UPDATE chat_sessions
    SET admin_attention = true, updated_at = now()
    WHERE id = p_session_id AND status <> 'closed';
    RETURN QUERY SELECT NULL::uuid, true;
    RETURN;
  END IF;

  INSERT INTO chat_assignments (session_id, user_id)
  VALUES (p_session_id, v_user)
  ON CONFLICT (session_id, user_id) DO NOTHING;

  INSERT INTO chat_staff_capacity (user_id, last_assigned_at)
  VALUES (v_user, now())
  ON CONFLICT (user_id) DO UPDATE
  SET last_assigned_at = excluded.last_assigned_at,
      updated_at = now();

  UPDATE chat_sessions
  SET status = 'active', admin_attention = false, updated_at = now()
  WHERE id = p_session_id AND status <> 'closed';

  INSERT INTO chat_messages (session_id, sender, body)
  VALUES (p_session_id, 'system', 'Hệ thống đã chuyển phiên chat cho tư vấn viên.')
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_user, false;
END;
$$;
GRANT EXECUTE ON FUNCTION route_chat_session(uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
