-- P12/P18: inherit customer responsibility through listings to property leads.
-- Customer assignment remains dynamic; do not materialize rows in lead_assignments.

CREATE INDEX IF NOT EXISTS idx_user_customer_assignments_active_staff_user
  ON public.user_customer_assignments(staff_user_id, user_id)
  WHERE ended_at IS NULL;

CREATE OR REPLACE FUNCTION public.is_customer_listing_lead_member(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.leads l
      JOIN public.user_listings ul
        ON ul.property_id = l.property_id
       AND ul.property_id IS NOT NULL
      JOIN public.user_customer_assignments a
        ON a.user_id = ul.user_id
       AND a.staff_user_id = auth.uid()
       AND a.ended_at IS NULL
      JOIN public.profiles staff
        ON staff.id = a.staff_user_id
       AND staff.role = 'staff'
      WHERE l.id = p_lead_id
    );
$$;

REVOKE ALL ON FUNCTION public.is_customer_listing_lead_member(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_customer_listing_lead_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "auth_select_leads" ON public.leads;
CREATE POLICY "auth_select_leads" ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_lead_member(id)
    OR public.is_customer_listing_lead_member(id)
  );

DROP POLICY IF EXISTS "auth_update_leads" ON public.leads;
CREATE POLICY "auth_update_leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR public.is_lead_member(id)
    OR public.is_customer_listing_lead_member(id)
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_lead_member(id)
    OR public.is_customer_listing_lead_member(id)
  );

DROP POLICY IF EXISTS "auth_select_lead_activities" ON public.lead_activities;
CREATE POLICY "auth_select_lead_activities" ON public.lead_activities
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_lead_member(lead_id)
    OR public.is_customer_listing_lead_member(lead_id)
  );

DROP POLICY IF EXISTS "auth_insert_lead_activities" ON public.lead_activities;
CREATE POLICY "auth_insert_lead_activities" ON public.lead_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.is_lead_member(lead_id)
    OR public.is_customer_listing_lead_member(lead_id)
  );

CREATE OR REPLACE FUNCTION public.assert_lead_crm_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Chưa xác thực' USING ERRCODE = '42501';
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NOT (public.is_lead_member(OLD.id) OR public.is_customer_listing_lead_member(OLD.id)) THEN
    RAISE EXCEPTION 'Lead ngoài phạm vi phụ trách' USING ERRCODE = '42501';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['status', 'note', 'follow_up_at']::text[])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'note', 'follow_up_at']::text[]) THEN
    RAISE EXCEPTION 'Chỉ được cập nhật trạng thái, ghi chú và lịch hẹn của lead' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_lead_crm_update_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lead_crm_update_scope ON public.leads;
CREATE TRIGGER trg_lead_crm_update_scope
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.assert_lead_crm_update_scope();

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
  IF p_patch ? 'property_id' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được thay đổi property của lead' USING ERRCODE = '42501';
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
    AND (
      public.is_admin()
      OR public.is_lead_member(id)
      OR public.is_customer_listing_lead_member(id)
    )
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
    AND (
      public.is_admin()
      OR public.is_lead_member(id)
      OR public.is_customer_listing_lead_member(id)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_listing_leads(
  p_user_id uuid,
  p_property_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  property_id uuid,
  property_title text,
  full_name text,
  phone text,
  message text,
  note text,
  status text,
  source text,
  follow_up_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền xem lead tin đăng' USING ERRCODE = '42501';
  END IF;
  IF p_limit < 1 OR p_limit > 100 OR p_offset < 0 OR p_offset > 100000 THEN
    RAISE EXCEPTION 'Phân trang không hợp lệ' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id AND p.role = 'user'
  ) THEN
    RAISE EXCEPTION 'Tài khoản không còn là customer user' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_admin() AND NOT public.is_customer_member(p_user_id) THEN
    RAISE EXCEPTION 'Customer ngoài phạm vi phụ trách' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT l.id, l.property_id, p.title, l.full_name, l.phone, l.message, l.note,
         l.status, l.source, l.follow_up_at, l.created_at
  FROM public.leads l
  JOIN public.properties p ON p.id = l.property_id
  WHERE EXISTS (
    SELECT 1
    FROM public.user_listings ul
    WHERE ul.user_id = p_user_id
      AND ul.property_id = l.property_id
      AND ul.property_id IS NOT NULL
  )
    AND (p_property_id IS NULL OR l.property_id = p_property_id)
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_listing_leads(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_listing_leads(uuid, uuid, integer, integer) TO authenticated;

-- Customer assignment is a read/support scope, not listing moderation authority.
CREATE OR REPLACE FUNCTION public.assert_user_listing_mutation_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Không được thay đổi chủ sở hữu tin đăng' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() = OLD.user_id OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Chỉ chủ tài khoản hoặc admin được sửa tin đăng' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_staff_customer_scope(
  p_staff_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  staff_user_id uuid,
  customer_user_id uuid,
  assignment_kind text,
  listing_count bigint,
  lead_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được xem tổng hợp phạm vi nhân viên' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT a.staff_user_id,
         a.user_id,
         a.assignment_kind,
         COUNT(DISTINCT ul.id),
         COUNT(DISTINCT l.id)
  FROM public.user_customer_assignments a
  LEFT JOIN public.user_listings ul ON ul.user_id = a.user_id
  LEFT JOIN public.leads l ON l.property_id = ul.property_id
  WHERE a.ended_at IS NULL
    AND (p_staff_user_id IS NULL OR a.staff_user_id = p_staff_user_id)
  GROUP BY a.staff_user_id, a.user_id, a.assignment_kind
  ORDER BY a.staff_user_id, a.assignment_kind, a.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_customer_scope(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_customer_scope(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
