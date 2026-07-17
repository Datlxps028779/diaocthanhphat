-- =============================================================================
-- Public write integrity + DB-level rate limiting
-- =============================================================================
-- Mục tiêu:
-- 1) Public forms không bơm dữ liệu CRM nội bộ tùy ý.
-- 2) Public lead/chat writes bị throttle ngay ở Postgres, kể cả khi attacker gọi thẳng
--    PostgREST/RPC bằng anon key và bỏ qua edge-function rate limit.

CREATE TABLE IF NOT EXISTS public_write_rate_limits (
  scope      text NOT NULL,
  key        text NOT NULL,
  bucket     timestamptz NOT NULL,
  hits       integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key, bucket)
);

ALTER TABLE public_write_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public_write_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION request_client_key()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  headers jsonb;
  xff text;
  ua text;
BEGIN
  BEGIN
    headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    headers := '{}'::jsonb;
  END;

  xff := split_part(COALESCE(headers->>'x-forwarded-for', headers->>'cf-connecting-ip', headers->>'x-real-ip', 'unknown'), ',', 1);
  ua := left(COALESCE(headers->>'user-agent', ''), 120);
  RETURN COALESCE(NULLIF(btrim(xff), ''), 'unknown') || ':' || md5(ua);
END;
$$;

CREATE OR REPLACE FUNCTION public_rate_limit_allow(p_scope text, p_limit integer, p_window_seconds integer DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := request_client_key();
  v_bucket timestamptz;
  v_hits integer;
BEGIN
  IF p_limit <= 0 OR p_window_seconds <= 0 THEN
    RETURN false;
  END IF;

  v_bucket := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public_write_rate_limits (scope, key, bucket, hits, updated_at)
  VALUES (p_scope, v_key, v_bucket, 1, now())
  ON CONFLICT (scope, key, bucket) DO UPDATE
    SET hits = public_write_rate_limits.hits + 1,
        updated_at = now()
  RETURNING hits INTO v_hits;

  DELETE FROM public_write_rate_limits
  WHERE bucket < now() - interval '1 day';

  RETURN v_hits <= p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION request_client_key() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public_rate_limit_allow(text, integer, integer) TO anon, authenticated;

DROP POLICY IF EXISTS "public_insert_leads" ON leads;
CREATE POLICY "public_insert_leads" ON leads FOR INSERT TO anon, authenticated
  WITH CHECK (
    public_rate_limit_allow('lead_insert', 12, 60)
    AND status = 'new'
    AND note IS NULL
    AND last_activity_at IS NULL
    AND zalo_user_id IS NULL
    AND (
      source IS NULL OR source IN (
        'property_detail_form',
        'property_callback',
        'contact_modal',
        'invest_page',
        'about_page',
        'valuation_page',
        'ai_advisor'
      )
    )
    AND (
      follow_up_at IS NULL
      OR (
        source = 'property_callback'
        AND follow_up_at >= now() - interval '5 minutes'
        AND follow_up_at <= now() + interval '30 days'
      )
    )
  );

-- Defense-in-depth: handle_new_user normally pre-creates profiles, but self-insert should
-- never be able to choose staff/admin if a profile row is absent.
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id AND role = 'user');

REVOKE EXECUTE ON FUNCTION is_admin_or_staff() FROM anon;

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
  IF NOT public_rate_limit_allow('chat_start', 10, 60) THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;

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
  IF NOT public_rate_limit_allow('chat_message', 60, 60) THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;
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
  IF NOT public_rate_limit_allow('chat_link_lead', 20, 60) THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;
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
  IF NOT public_rate_limit_allow('chat_request_staff', 10, 60) THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;
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

CREATE OR REPLACE FUNCTION route_chat_session(p_session_id uuid, p_visitor_token text DEFAULT NULL)
RETURNS TABLE(assigned_user_id uuid, admin_attention boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_ok boolean;
  v_public boolean;
BEGIN
  v_public := NOT is_admin();
  IF NOT (is_admin() OR can_access_public_chat(p_session_id, p_visitor_token)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_public AND NOT public_rate_limit_allow('chat_route', 10, 60) THEN
    RAISE EXCEPTION 'Rate limit exceeded';
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

  RETURN QUERY SELECT CASE WHEN v_public THEN NULL::uuid ELSE v_user END, false;
END;
$$;
GRANT EXECUTE ON FUNCTION route_chat_session(uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
