-- P12: tạo lead thủ công cùng assignment và activity trong một transaction.
-- Chỉ migration; không tự chạy trên production.

CREATE OR REPLACE FUNCTION public.admin_create_lead(
  p_full_name text,
  p_phone text,
  p_area_interest text DEFAULT NULL,
  p_budget text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_status text DEFAULT 'new',
  p_property_id uuid DEFAULT NULL,
  p_assignee_ids uuid[] DEFAULT '{}'::uuid[],
  p_author text DEFAULT NULL
)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_lead public.leads%ROWTYPE;
  v_member_ids uuid[];
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền tạo lead' USING ERRCODE = '42501';
  END IF;

  v_member_ids := ARRAY(
    SELECT DISTINCT member_id
    FROM unnest(coalesce(p_assignee_ids, '{}'::uuid[]) || ARRAY[v_actor]) AS requested(member_id)
  );

  IF EXISTS (
    SELECT 1
    FROM unnest(v_member_ids) AS requested(member_id)
    LEFT JOIN public.profiles p
      ON p.id = requested.member_id
     AND p.role IN ('admin', 'staff')
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Danh sách phụ trách không hợp lệ' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.leads (
    full_name,
    phone,
    area_interest,
    budget,
    message,
    status,
    source,
    property_id
  ) VALUES (
    p_full_name,
    p_phone,
    p_area_interest,
    p_budget,
    p_message,
    p_status,
    'admin_manual',
    p_property_id
  )
  RETURNING * INTO v_lead;

  INSERT INTO public.lead_assignments (lead_id, user_id, added_by)
  SELECT v_lead.id, member_id, v_actor
  FROM unnest(v_member_ids) AS requested(member_id)
  ON CONFLICT (lead_id, user_id) DO NOTHING;

  INSERT INTO public.lead_activities (lead_id, kind, body, author)
  VALUES (v_lead.id, 'created', 'Tạo khách thủ công', p_author);

  RETURN v_lead;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_lead(text, text, text, text, text, text, uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_lead(text, text, text, text, text, text, uuid, uuid[], text) TO authenticated;

NOTIFY pgrst, 'reload schema';
