-- =============================================================================
-- Hardening P7 Chat Ops public handoff
-- =============================================================================
-- Public widget chỉ được link phiên chat tới lead AI Advisor vừa tạo cùng số điện thoại,
-- và chỉ được route staff sau khi đã có contact. Chặn spam route phiên chưa contact.

CREATE OR REPLACE FUNCTION public_link_chat_lead(
  p_session_id uuid,
  p_visitor_token text,
  p_lead_id uuid,
  p_visitor_name text DEFAULT NULL,
  p_visitor_phone text DEFAULT NULL,
  p_need_summary text DEFAULT NULL,
  p_property_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := btrim(COALESCE(p_visitor_phone, ''));
BEGIN
  IF NOT can_access_public_chat(p_session_id, p_visitor_token) THEN
    RAISE EXCEPTION 'Invalid chat session';
  END IF;

  IF v_phone = '' OR NOT EXISTS (
    SELECT 1 FROM leads
    WHERE id = p_lead_id
      AND source = 'ai_advisor'
      AND regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g')
  ) THEN
    RAISE EXCEPTION 'Invalid lead link';
  END IF;

  UPDATE chat_sessions
  SET lead_id = p_lead_id,
      visitor_name = NULLIF(btrim(p_visitor_name), ''),
      visitor_phone = NULLIF(v_phone, ''),
      need_summary = COALESCE(NULLIF(btrim(p_need_summary), ''), need_summary),
      property_id = COALESCE(p_property_id, property_id),
      updated_at = now()
  WHERE id = p_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public_link_chat_lead(uuid, text, uuid, text, text, text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION route_chat_session(p_session_id uuid, p_visitor_token text DEFAULT NULL)
RETURNS TABLE(assigned_user_id uuid, admin_attention boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_has_contact boolean;
BEGIN
  IF NOT (is_admin() OR can_access_public_chat(p_session_id, p_visitor_token)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT (lead_id IS NOT NULL OR NULLIF(btrim(COALESCE(visitor_phone, '')), '') IS NOT NULL)
  INTO v_has_contact
  FROM chat_sessions
  WHERE id = p_session_id;

  IF NOT COALESCE(v_has_contact, false) THEN
    RAISE EXCEPTION 'Contact required before routing';
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
