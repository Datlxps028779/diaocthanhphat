-- P12: explicit account identity links for CRM leads and chat sessions
-- No phone matching or automatic backfill. Production execution is user-run.

CREATE OR REPLACE FUNCTION public.is_user_customer_account(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN NOT public.is_admin() AND auth.uid() <> p_user_id THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = p_user_id
        AND p.role = 'user'
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_user_customer_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_customer_account(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_start_chat_session(
  p_session_id uuid,
  p_visitor_token text,
  p_need_summary text DEFAULT NULL,
  p_property_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public_rate_limit_allow('chat_start', 10, 60) THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;

  SELECT CASE WHEN public.is_user_customer_account(auth.uid()) THEN auth.uid() ELSE NULL END INTO v_user_id;

  INSERT INTO public.chat_sessions (id, visitor_token, need_summary, property_id, user_id, last_message)
  VALUES (
    p_session_id,
    p_visitor_token,
    NULLIF(btrim(p_need_summary), ''),
    p_property_id,
    v_user_id,
    NULLIF(btrim(p_need_summary), '')
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.public_start_chat_session(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_start_chat_session(uuid, text, text, uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "public_insert_leads" ON public.leads;
CREATE POLICY "public_insert_leads" ON public.leads FOR INSERT TO anon, authenticated
  WITH CHECK (
    public_rate_limit_allow('lead_insert', 12, 60)
    AND (
      user_id IS NULL
      OR (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
        AND public.is_user_customer_account(user_id)
      )
    )
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

CREATE OR REPLACE FUNCTION public.get_customer_linked_leads(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  full_name text,
  phone text,
  status text,
  source text,
  property_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT l.id, l.full_name, l.phone, l.status, l.source, l.property_id, l.created_at
  FROM public.leads l
  WHERE l.user_id = p_user_id
    AND EXISTS (
      SELECT 1 FROM public.user_customer_records c
      WHERE c.user_id = p_user_id
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = p_user_id
        AND p.role = 'user'
    )
    AND (public.is_admin() OR public.is_customer_member(p_user_id))
  ORDER BY l.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_linked_chats(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  status text,
  visitor_name text,
  need_summary text,
  lead_id uuid,
  property_id uuid,
  admin_attention boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.status, c.visitor_name, c.need_summary, c.lead_id, c.property_id,
         c.admin_attention, c.created_at, c.updated_at, c.last_message_at
  FROM public.chat_sessions c
  WHERE c.user_id = p_user_id
    AND EXISTS (
      SELECT 1 FROM public.user_customer_records r
      WHERE r.user_id = p_user_id
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = p_user_id
        AND p.role = 'user'
    )
    AND (public.is_admin() OR public.is_customer_member(p_user_id))
  ORDER BY c.last_message_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_customer_linked_leads(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_customer_linked_chats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_linked_leads(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_linked_chats(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_link_customer_lead(
  p_user_id uuid,
  p_lead_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_linked_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được liên kết lead với customer' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_customer_records WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Không tìm thấy customer' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_user_customer_account(p_user_id) THEN
    RAISE EXCEPTION 'Tài khoản không còn là customer user' USING ERRCODE = 'P0001';
  END IF;

  SELECT user_id INTO v_linked_user_id
  FROM public.leads
  WHERE id = p_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy lead' USING ERRCODE = 'P0002';
  END IF;
  IF v_linked_user_id IS NOT NULL AND v_linked_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Lead đã liên kết với customer khác' USING ERRCODE = '23505';
  END IF;
  IF v_linked_user_id = p_user_id THEN
    RETURN;
  END IF;

  UPDATE public.leads SET user_id = p_user_id WHERE id = p_lead_id;
  PERFORM public.record_customer_activity(
    p_user_id,
    'system',
    'Liên kết lead CRM với customer',
    jsonb_build_object('entity_type', 'lead', 'entity_id', p_lead_id, 'action', 'link')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unlink_customer_lead(
  p_user_id uuid,
  p_lead_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được bỏ liên kết lead với customer' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = p_lead_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Lead không thuộc customer này' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.leads SET user_id = NULL WHERE id = p_lead_id AND user_id = p_user_id;
  PERFORM public.record_customer_activity(
    p_user_id,
    'system',
    'Bỏ liên kết lead CRM khỏi customer',
    jsonb_build_object('entity_type', 'lead', 'entity_id', p_lead_id, 'action', 'unlink')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_link_customer_chat(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_linked_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được liên kết chat với customer' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_customer_records WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Không tìm thấy customer' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_user_customer_account(p_user_id) THEN
    RAISE EXCEPTION 'Tài khoản không còn là customer user' USING ERRCODE = 'P0001';
  END IF;

  SELECT user_id INTO v_linked_user_id
  FROM public.chat_sessions
  WHERE id = p_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiên chat' USING ERRCODE = 'P0002';
  END IF;
  IF v_linked_user_id IS NOT NULL AND v_linked_user_id <> p_user_id THEN
    RAISE EXCEPTION 'Phiên chat đã liên kết với customer khác' USING ERRCODE = '23505';
  END IF;
  IF v_linked_user_id = p_user_id THEN
    RETURN;
  END IF;

  UPDATE public.chat_sessions SET user_id = p_user_id, updated_at = now()
  WHERE id = p_session_id;
  PERFORM public.record_customer_activity(
    p_user_id,
    'system',
    'Liên kết phiên chat với customer',
    jsonb_build_object('entity_type', 'chat_session', 'entity_id', p_session_id, 'action', 'link')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unlink_customer_chat(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được bỏ liên kết chat với customer' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_sessions
    WHERE id = p_session_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Phiên chat không thuộc customer này' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.chat_sessions SET user_id = NULL, updated_at = now()
  WHERE id = p_session_id AND user_id = p_user_id;
  PERFORM public.record_customer_activity(
    p_user_id,
    'system',
    'Bỏ liên kết phiên chat khỏi customer',
    jsonb_build_object('entity_type', 'chat_session', 'entity_id', p_session_id, 'action', 'unlink')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_lead_crm(
  p_lead_id uuid,
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền cập nhật lead CRM' USING ERRCODE = '42501';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Dữ liệu lead CRM không hợp lệ' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_patch) AS item(key)
    WHERE key NOT IN ('status', 'note', 'follow_up_at', 'property_id')
  ) THEN
    RAISE EXCEPTION 'Trường lead CRM không được phép' USING ERRCODE = '22023';
  END IF;
  IF p_patch ? 'status' AND (
    p_patch->>'status' IS NULL
    OR p_patch->>'status' NOT IN ('new', 'contacted', 'nurturing', 'viewing', 'negotiating', 'won', 'lost')
  ) THEN
    RAISE EXCEPTION 'Trạng thái lead không hợp lệ' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id
    AND (public.is_admin() OR public.is_lead_member(id))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy lead hoặc lead ngoài phạm vi phụ trách' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.leads
  SET status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE v_lead.status END,
      note = CASE WHEN p_patch ? 'note' THEN p_patch->>'note' ELSE v_lead.note END,
      follow_up_at = CASE WHEN p_patch ? 'follow_up_at' THEN NULLIF(p_patch->>'follow_up_at', '')::timestamptz ELSE v_lead.follow_up_at END,
      property_id = CASE WHEN p_patch ? 'property_id' THEN NULLIF(p_patch->>'property_id', '')::uuid ELSE v_lead.property_id END
  WHERE id = p_lead_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_bulk_update_lead_status(
  p_lead_ids uuid[],
  p_status text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền cập nhật lead CRM' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('new', 'contacted', 'nurturing', 'viewing', 'negotiating', 'won', 'lost') THEN
    RAISE EXCEPTION 'Trạng thái lead không hợp lệ' USING ERRCODE = '22023';
  END IF;

  UPDATE public.leads
  SET status = p_status
  WHERE id = ANY(p_lead_ids)
    AND (public.is_admin() OR public.is_lead_member(id));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_lead_crm(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_bulk_update_lead_status(uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_lead_crm(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_update_lead_status(uuid[], text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_link_customer_lead(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_unlink_customer_lead(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_link_customer_chat(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_unlink_customer_chat(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_link_customer_lead(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlink_customer_lead(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_link_customer_chat(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlink_customer_chat(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
