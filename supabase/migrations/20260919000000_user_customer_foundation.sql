-- =============================================================================
-- P12/P17: customer account foundation, explicit staff assignment, and scoped RLS
-- =============================================================================
-- Additive and idempotent. Production SQL is intentionally user-run; this migration
-- does not link existing leads/chats by phone and does not create assignments.

CREATE TABLE IF NOT EXISTS public.user_customer_records (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'active', 'qualified', 'inactive', 'blocked')),
  tags text[] NOT NULL DEFAULT '{}'::text[],
  source text,
  first_contacted_at timestamptz,
  last_contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_customer_records_tags_array CHECK (array_ndims(tags) IS NULL OR array_ndims(tags) = 1)
);

CREATE TABLE IF NOT EXISTS public.user_customer_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('note', 'status_change', 'assignment_change', 'system')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 10000),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_customer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_kind text NOT NULL CHECK (assignment_kind IN ('primary', 'co_assignee')),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE IF NOT EXISTS public.staff_customer_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT true,
  max_active_customers integer NOT NULL DEFAULT 50 CHECK (max_active_customers > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_customer_records_status
  ON public.user_customer_records(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_customer_activities_user_time
  ON public.user_customer_activities(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_customer_activities_kind_time
  ON public.user_customer_activities(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_customer_assignments_user_active
  ON public.user_customer_assignments(user_id, started_at DESC)
  WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_customer_assignments_staff_active
  ON public.user_customer_assignments(staff_user_id, started_at DESC)
  WHERE ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_customer_primary_active
  ON public.user_customer_assignments(user_id)
  WHERE assignment_kind = 'primary' AND ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_customer_assignment_active_pair
  ON public.user_customer_assignments(user_id, staff_user_id, assignment_kind)
  WHERE ended_at IS NULL;

ALTER TABLE public.user_customer_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_customer_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_customer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_customer_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_customer_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_customer_assignments a
    JOIN public.profiles p ON p.id = a.staff_user_id
    WHERE a.user_id = p_user_id
      AND a.staff_user_id = auth.uid()
      AND a.ended_at IS NULL
      AND p.role = 'staff'
  );
$$;

REVOKE ALL ON FUNCTION public.is_customer_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_customer_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "customer_records_team_select" ON public.user_customer_records;
CREATE POLICY "customer_records_team_select"
  ON public.user_customer_records
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_customer_member(user_id));

DROP POLICY IF EXISTS "customer_activities_team_select" ON public.user_customer_activities;
CREATE POLICY "customer_activities_team_select"
  ON public.user_customer_activities
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_customer_member(user_id));

DROP POLICY IF EXISTS "customer_assignments_team_select" ON public.user_customer_assignments;
CREATE POLICY "customer_assignments_team_select"
  ON public.user_customer_assignments
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_customer_member(user_id));

DROP POLICY IF EXISTS "staff_customer_settings_select" ON public.staff_customer_settings;
CREATE POLICY "staff_customer_settings_select"
  ON public.staff_customer_settings
  FOR SELECT TO authenticated
  USING (public.is_admin() OR auth.uid() = user_id);

REVOKE ALL ON TABLE public.user_customer_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_customer_activities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_customer_assignments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.staff_customer_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_customer_records TO authenticated;
GRANT SELECT ON TABLE public.user_customer_activities TO authenticated;
GRANT SELECT ON TABLE public.user_customer_assignments TO authenticated;
GRANT SELECT ON TABLE public.staff_customer_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_user_customer_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_user_customer_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_user_customer_records_updated_at ON public.user_customer_records;
CREATE TRIGGER trg_user_customer_records_updated_at
  BEFORE UPDATE ON public.user_customer_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_customer_updated_at();

DROP TRIGGER IF EXISTS trg_staff_customer_settings_updated_at ON public.staff_customer_settings;
CREATE TRIGGER trg_staff_customer_settings_updated_at
  BEFORE UPDATE ON public.staff_customer_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_customer_updated_at();

CREATE OR REPLACE FUNCTION public.sync_user_customer_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'user' THEN
    INSERT INTO public.user_customer_records (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_customer_record() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_user_customer_record ON public.profiles;
CREATE TRIGGER trg_sync_user_customer_record
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_customer_record();

INSERT INTO public.user_customer_records (user_id)
SELECT p.id
FROM public.profiles p
WHERE p.role = 'user'
ON CONFLICT (user_id) DO NOTHING;

-- Existing public/admin lead writes must not be able to inject an account identity.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON public.leads(user_id) WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS "public_insert_leads" ON public.leads;
CREATE POLICY "public_insert_leads" ON public.leads FOR INSERT TO anon, authenticated
  WITH CHECK (
    public_rate_limit_allow('lead_insert', 12, 60)
    AND user_id IS NULL
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

DROP POLICY IF EXISTS "admin_insert_leads" ON public.leads;
CREATE POLICY "admin_insert_leads" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_staff() AND user_id IS NULL);

DROP POLICY IF EXISTS "auth_update_leads" ON public.leads;
CREATE POLICY "auth_update_leads" ON public.leads FOR UPDATE TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff() AND user_id IS NULL);

-- Chat sessions are public-token scoped; account linking is reserved for a later
-- explicit authenticated/admin RPC and cannot be injected through direct writes.
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id) WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS "chat_sessions_insert_admin" ON public.chat_sessions;
CREATE POLICY "chat_sessions_insert_admin" ON public.chat_sessions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_staff() AND user_id IS NULL);

DROP POLICY IF EXISTS "chat_sessions_update" ON public.chat_sessions;
CREATE POLICY "chat_sessions_update" ON public.chat_sessions FOR UPDATE TO authenticated
  USING (public.is_admin() OR is_chat_member(id))
  WITH CHECK ((public.is_admin() OR is_chat_member(id)) AND (public.is_admin() OR user_id IS NULL));

CREATE OR REPLACE FUNCTION public.record_customer_activity(
  p_user_id uuid,
  p_kind text,
  p_body text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.user_customer_activities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_activity public.user_customer_activities;
BEGIN
  IF p_kind NOT IN ('note', 'status_change', 'assignment_change', 'system') THEN
    RAISE EXCEPTION 'Loại hoạt động không hợp lệ' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_customer_activities (user_id, kind, body, author_id, metadata)
  VALUES (p_user_id, p_kind, p_body, auth.uid(), COALESCE(p_metadata, '{}'::jsonb))
  RETURNING * INTO v_activity;

  RETURN v_activity;
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_activity(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.add_customer_note(
  p_user_id uuid,
  p_body text
)
RETURNS public.user_customer_activities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin() OR public.is_customer_member(p_user_id)) THEN
    RAISE EXCEPTION 'Không có quyền ghi chú customer' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Nội dung ghi chú không hợp lệ' USING ERRCODE = '22023';
  END IF;
  RETURN public.record_customer_activity(p_user_id, 'note', btrim(p_body));
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_customer_note(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_customer_status_tags(
  p_user_id uuid,
  p_status text,
  p_tags text[] DEFAULT '{}'::text[]
)
RETURNS public.user_customer_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before public.user_customer_records;
  v_after public.user_customer_records;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin() OR public.is_customer_member(p_user_id)) THEN
    RAISE EXCEPTION 'Không có quyền cập nhật customer' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('new', 'active', 'qualified', 'inactive', 'blocked') THEN
    RAISE EXCEPTION 'Trạng thái customer không hợp lệ' USING ERRCODE = '22023';
  END IF;
  IF coalesce(array_length(p_tags, 1), 0) > 20
     OR EXISTS (SELECT 1 FROM unnest(coalesce(p_tags, '{}'::text[])) tag WHERE char_length(btrim(tag)) NOT BETWEEN 1 AND 50) THEN
    RAISE EXCEPTION 'Tags customer không hợp lệ' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_before
  FROM public.user_customer_records
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy customer' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.user_customer_records
  SET status = p_status,
      tags = COALESCE(p_tags, '{}'::text[]),
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING * INTO v_after;

  IF v_before.status IS DISTINCT FROM v_after.status THEN
    PERFORM public.record_customer_activity(
      p_user_id,
      'status_change',
      format('Đổi trạng thái customer: %s → %s', v_before.status, v_after.status),
      jsonb_build_object('from_status', v_before.status, 'to_status', v_after.status)
    );
  END IF;

  RETURN v_after;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_customer_status_tags(uuid, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_assignable_customer_staff(p_staff_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN public.staff_customer_settings s ON s.user_id = p.id
    WHERE p.id = p_staff_user_id
      AND p.role = 'staff'
      AND COALESCE(s.is_available, true)
  ) THEN
    RAISE EXCEPTION 'Nhân viên customer không hợp lệ hoặc đang tắt' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_assignable_customer_staff(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_customer_primary(
  p_user_id uuid,
  p_staff_user_id uuid
)
RETURNS public.user_customer_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.user_customer_assignments;
  v_assignment public.user_customer_assignments;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được phân công customer' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_customer_records WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Không tìm thấy customer' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_assignable_customer_staff(p_staff_user_id);

  SELECT * INTO v_existing
  FROM public.user_customer_assignments
  WHERE user_id = p_user_id
    AND assignment_kind = 'primary'
    AND ended_at IS NULL
  FOR UPDATE;

  IF v_existing.staff_user_id = p_staff_user_id THEN
    RETURN v_existing;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.user_customer_assignments
    SET ended_at = now()
    WHERE id = v_existing.id;
  END IF;

  INSERT INTO public.user_customer_assignments (user_id, staff_user_id, assignment_kind, assigned_by)
  VALUES (p_user_id, p_staff_user_id, 'primary', auth.uid())
  RETURNING * INTO v_assignment;

  PERFORM public.record_customer_activity(
    p_user_id,
    'assignment_change',
    'Cập nhật nhân viên phụ trách chính',
    jsonb_build_object('assignment_kind', 'primary', 'staff_user_id', p_staff_user_id)
  );

  RETURN v_assignment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_customer_primary(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_customer_co_assignee(
  p_user_id uuid,
  p_staff_user_id uuid
)
RETURNS public.user_customer_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment public.user_customer_assignments;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được phân công customer' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_customer_records WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Không tìm thấy customer' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_assignable_customer_staff(p_staff_user_id);

  SELECT * INTO v_assignment
  FROM public.user_customer_assignments
  WHERE user_id = p_user_id
    AND staff_user_id = p_staff_user_id
    AND assignment_kind = 'co_assignee'
    AND ended_at IS NULL
  FOR UPDATE;

  IF v_assignment.id IS NOT NULL THEN
    RETURN v_assignment;
  END IF;

  INSERT INTO public.user_customer_assignments (user_id, staff_user_id, assignment_kind, assigned_by)
  VALUES (p_user_id, p_staff_user_id, 'co_assignee', auth.uid())
  RETURNING * INTO v_assignment;

  PERFORM public.record_customer_activity(
    p_user_id,
    'assignment_change',
    'Thêm nhân viên đồng phụ trách',
    jsonb_build_object('assignment_kind', 'co_assignee', 'staff_user_id', p_staff_user_id)
  );

  RETURN v_assignment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_customer_co_assignee(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_customer_assignment(p_assignment_id uuid)
RETURNS public.user_customer_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment public.user_customer_assignments;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được kết thúc phân công customer' USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_customer_assignments
  SET ended_at = now()
  WHERE id = p_assignment_id
    AND ended_at IS NULL
  RETURNING * INTO v_assignment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phân công đang hoạt động' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.record_customer_activity(
    v_assignment.user_id,
    'assignment_change',
    'Kết thúc phân công nhân viên',
    jsonb_build_object(
      'assignment_id', v_assignment.id,
      'assignment_kind', v_assignment.assignment_kind,
      'staff_user_id', v_assignment.staff_user_id
    )
  );

  RETURN v_assignment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_customer_assignment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_staff_customer_settings(
  p_staff_user_id uuid,
  p_is_available boolean,
  p_max_active_customers integer DEFAULT 50
)
RETURNS public.staff_customer_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settings public.staff_customer_settings;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được cấu hình nhân viên customer' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_user_id AND role = 'staff') THEN
    RAISE EXCEPTION 'Tài khoản không phải nhân viên' USING ERRCODE = '22023';
  END IF;
  IF p_max_active_customers <= 0 THEN
    RAISE EXCEPTION 'Sức chứa customer phải lớn hơn 0' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.staff_customer_settings (user_id, is_available, max_active_customers)
  VALUES (p_staff_user_id, p_is_available, p_max_active_customers)
  ON CONFLICT (user_id) DO UPDATE
  SET is_available = EXCLUDED.is_available,
      max_active_customers = EXCLUDED.max_active_customers,
      updated_at = now()
  RETURNING * INTO v_settings;

  RETURN v_settings;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_staff_customer_settings(uuid, boolean, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_customer_support()
RETURNS TABLE(staff_display_name text, assignment_kind text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.display_name,
    a.assignment_kind
  FROM public.user_customer_assignments a
  JOIN public.profiles p ON p.id = a.staff_user_id
  WHERE a.user_id = auth.uid()
    AND a.ended_at IS NULL
    AND p.role = 'staff'
  ORDER BY CASE WHEN a.assignment_kind = 'primary' THEN 0 ELSE 1 END, a.started_at;
$$;

REVOKE ALL ON FUNCTION public.get_my_customer_support() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_customer_support() TO authenticated;

-- Staff may read and review listings/media only for customers assigned to them.
DROP POLICY IF EXISTS "user_listings_admin_select" ON public.user_listings;
CREATE POLICY "user_listings_admin_select" ON public.user_listings FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_customer_member(user_id));

DROP POLICY IF EXISTS "user_listings_admin_update" ON public.user_listings;
CREATE POLICY "user_listings_admin_update" ON public.user_listings FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_customer_member(user_id))
  WITH CHECK (public.is_admin() OR public.is_customer_member(user_id));

DROP POLICY IF EXISTS "um_select_admin" ON public.user_media;
CREATE POLICY "um_select_admin" ON public.user_media FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_customer_member(user_id));

-- Staff may read the assigned customer's basic profile, but no unrelated profiles.
DROP POLICY IF EXISTS "profiles_select_assigned_customer" ON public.profiles;
CREATE POLICY "profiles_select_assigned_customer" ON public.profiles FOR SELECT
  TO authenticated USING (public.is_customer_member(id));

NOTIFY pgrst, 'reload schema';
