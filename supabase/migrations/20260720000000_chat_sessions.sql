-- =============================================================================
-- P7 Chat Ops: phiên chat AI Advisor + phân công nhân viên theo capacity
-- =============================================================================
-- DB là nguồn sự thật: admin thấy tất cả; staff chỉ thấy phiên được gán; public widget
-- không được list bảng trực tiếp mà đi qua RPC session_id + visitor_token.

CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_token text NOT NULL,
  source text DEFAULT 'ai_advisor' NOT NULL,
  status text DEFAULT 'new' NOT NULL CHECK (status IN ('new', 'active', 'closed')),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  visitor_name text,
  visitor_phone text,
  need_summary text,
  last_message text,
  admin_attention boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  last_message_at timestamptz DEFAULT now() NOT NULL,
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
  sender text NOT NULL CHECK (sender IN ('visitor', 'assistant', 'staff', 'system')),
  body text NOT NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(session_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_staff_capacity (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  max_active_sessions integer DEFAULT 3 NOT NULL CHECK (max_active_sessions > 0),
  is_available boolean DEFAULT true NOT NULL,
  last_assigned_at timestamptz,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_attention ON chat_sessions(admin_attention, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_lead_id ON chat_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_assignments_session_id ON chat_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_assignments_user_id ON chat_assignments(user_id);

CREATE OR REPLACE FUNCTION touch_chat_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE chat_sessions
  SET last_message = NEW.body,
      last_message_at = NEW.created_at,
      updated_at = now()
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_chat_session ON chat_messages;
CREATE TRIGGER trg_touch_chat_session
AFTER INSERT ON chat_messages
FOR EACH ROW EXECUTE FUNCTION touch_chat_session();

CREATE OR REPLACE FUNCTION is_chat_member(p_session uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_assignments
    WHERE session_id = p_session AND user_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION is_chat_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION can_access_public_chat(p_session uuid, p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_sessions
    WHERE id = p_session AND visitor_token = p_token
  );
$$;

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_staff_capacity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_sessions_select" ON chat_sessions;
CREATE POLICY "chat_sessions_select" ON chat_sessions FOR SELECT TO authenticated
  USING (is_admin() OR is_chat_member(id));

DROP POLICY IF EXISTS "chat_sessions_update" ON chat_sessions;
CREATE POLICY "chat_sessions_update" ON chat_sessions FOR UPDATE TO authenticated
  USING (is_admin() OR is_chat_member(id))
  WITH CHECK (is_admin() OR is_chat_member(id));

DROP POLICY IF EXISTS "chat_sessions_insert_admin" ON chat_sessions;
CREATE POLICY "chat_sessions_insert_admin" ON chat_sessions FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff());

DROP POLICY IF EXISTS "chat_messages_select" ON chat_messages;
CREATE POLICY "chat_messages_select" ON chat_messages FOR SELECT TO authenticated
  USING (is_admin() OR is_chat_member(session_id));

DROP POLICY IF EXISTS "chat_messages_insert_staff" ON chat_messages;
CREATE POLICY "chat_messages_insert_staff" ON chat_messages FOR INSERT TO authenticated
  WITH CHECK ((is_admin() OR is_chat_member(session_id)) AND sender IN ('staff', 'system') AND author_id = auth.uid());

DROP POLICY IF EXISTS "chat_assignments_select" ON chat_assignments;
CREATE POLICY "chat_assignments_select" ON chat_assignments FOR SELECT TO authenticated
  USING (is_admin() OR is_chat_member(session_id));

DROP POLICY IF EXISTS "chat_assignments_insert" ON chat_assignments;
CREATE POLICY "chat_assignments_insert" ON chat_assignments FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_chat_member(session_id));

DROP POLICY IF EXISTS "chat_assignments_delete" ON chat_assignments;
CREATE POLICY "chat_assignments_delete" ON chat_assignments FOR DELETE TO authenticated
  USING (is_admin() OR is_chat_member(session_id));

DROP POLICY IF EXISTS "chat_capacity_select" ON chat_staff_capacity;
CREATE POLICY "chat_capacity_select" ON chat_staff_capacity FOR SELECT TO authenticated
  USING (is_admin_or_staff());

DROP POLICY IF EXISTS "chat_capacity_upsert_admin" ON chat_staff_capacity;
CREATE POLICY "chat_capacity_upsert_admin" ON chat_staff_capacity FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION public_start_chat_session(
  p_session_id uuid,
  p_visitor_token text,
  p_need_summary text DEFAULT NULL,
  p_property_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO chat_sessions (id, visitor_token, need_summary, property_id, last_message)
  VALUES (p_session_id, p_visitor_token, NULLIF(btrim(p_need_summary), ''), p_property_id, NULLIF(btrim(p_need_summary), ''))
  ON CONFLICT (id) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public_start_chat_session(uuid, text, text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public_append_chat_message(
  p_session_id uuid,
  p_visitor_token text,
  p_sender text,
  p_body text
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
  IF p_sender NOT IN ('visitor', 'assistant') THEN
    RAISE EXCEPTION 'Invalid public sender';
  END IF;
  IF btrim(p_body) = '' THEN
    RETURN;
  END IF;
  INSERT INTO chat_messages (session_id, sender, body)
  VALUES (p_session_id, p_sender, left(btrim(p_body), 4000));
END;
$$;
GRANT EXECUTE ON FUNCTION public_append_chat_message(uuid, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public_get_chat_messages(p_session_id uuid, p_visitor_token text)
RETURNS TABLE(id uuid, sender text, body text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.sender, m.body, m.created_at
  FROM chat_messages m
  WHERE m.session_id = p_session_id
    AND can_access_public_chat(p_session_id, p_visitor_token)
  ORDER BY m.created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public_get_chat_messages(uuid, text) TO anon, authenticated;

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
BEGIN
  IF NOT can_access_public_chat(p_session_id, p_visitor_token) THEN
    RAISE EXCEPTION 'Invalid chat session';
  END IF;

  UPDATE chat_sessions
  SET lead_id = p_lead_id,
      visitor_name = NULLIF(btrim(p_visitor_name), ''),
      visitor_phone = NULLIF(btrim(p_visitor_phone), ''),
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
BEGIN
  IF NOT (is_admin() OR can_access_public_chat(p_session_id, p_visitor_token)) THEN
    RAISE EXCEPTION 'Not allowed';
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

CREATE OR REPLACE FUNCTION close_chat_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_admin() OR is_chat_member(p_session_id)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE chat_sessions
  SET status = 'closed', closed_at = now(), updated_at = now()
  WHERE id = p_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION close_chat_session(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
