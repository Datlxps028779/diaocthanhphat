CREATE TABLE IF NOT EXISTS public.staff_permission_catalog (
  module text NOT NULL,
  action text NOT NULL,
  label text NOT NULL,
  PRIMARY KEY (module, action)
);

CREATE TABLE IF NOT EXISTS public.staff_permission_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module text NOT NULL,
  action text NOT NULL,
  scope_kind text NOT NULL DEFAULT 'global',
  scope_id uuid,
  granted_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_permission_assignment_catalog_fk
    FOREIGN KEY (module, action)
    REFERENCES public.staff_permission_catalog(module, action)
    ON DELETE CASCADE,
  CONSTRAINT staff_permission_assignment_scope_kind_check
    CHECK (scope_kind IN ('global', 'area', 'district', 'ward', 'neighborhood')),
  CONSTRAINT staff_permission_assignment_scope_shape_check
    CHECK ((scope_kind = 'global' AND scope_id IS NULL) OR (scope_kind <> 'global' AND scope_id IS NOT NULL)),
  UNIQUE (staff_user_id, module, action, scope_kind, scope_id)
);

CREATE INDEX IF NOT EXISTS staff_permission_assignments_staff_idx
  ON public.staff_permission_assignments(staff_user_id, module, action);
CREATE INDEX IF NOT EXISTS staff_permission_assignments_scope_idx
  ON public.staff_permission_assignments(scope_kind, scope_id);

CREATE TABLE IF NOT EXISTS public.staff_permission_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  operation text NOT NULL CHECK (operation IN ('replace', 'revoke')),
  permission_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.staff_permission_catalog(module, action, label)
VALUES
  ('dashboard', 'view', 'Tổng quan'),
  ('properties', 'view', 'Bất động sản'),
  ('properties', 'create', 'Bất động sản'),
  ('properties', 'edit', 'Bất động sản'),
  ('properties', 'delete', 'Bất động sản'),
  ('properties', 'publish', 'Bất động sản'),
  ('properties', 'manage_media', 'Bất động sản'),
  ('properties', 'manage_seo', 'Bất động sản'),
  ('property-verification', 'view', 'Hồ sơ kiểm tra'),
  ('property-verification', 'approve', 'Hồ sơ kiểm tra'),
  ('property-verification', 'reject', 'Hồ sơ kiểm tra'),
  ('leads', 'view', 'Leads / CRM'),
  ('leads', 'edit', 'Leads / CRM'),
  ('chat-sessions', 'view', 'Phiên chat'),
  ('chat-sessions', 'edit', 'Phiên chat'),
  ('nurture', 'view', 'Nuôi dưỡng'),
  ('nurture', 'edit', 'Nuôi dưỡng'),
  ('user-listings', 'view', 'Duyệt tin đăng'),
  ('user-listings', 'edit', 'Duyệt tin đăng'),
  ('user-listings', 'approve', 'Duyệt tin đăng'),
  ('user-listings', 'reject', 'Duyệt tin đăng'),
  ('user-listings', 'manage_media', 'Duyệt tin đăng'),
  ('user-listings', 'manage_seo', 'Duyệt tin đăng'),
  ('users', 'view', 'Khách hàng / CRM'),
  ('users', 'edit', 'Khách hàng / CRM'),
  ('agent-profiles', 'view', 'Hồ sơ công khai'),
  ('agent-profiles', 'edit', 'Hồ sơ công khai'),
  ('agent-profiles', 'publish', 'Hồ sơ công khai'),
  ('projects', 'view', 'Dự án'),
  ('projects', 'create', 'Dự án'),
  ('projects', 'edit', 'Dự án'),
  ('projects', 'delete', 'Dự án'),
  ('projects', 'publish', 'Dự án'),
  ('news', 'view', 'Tin tức'),
  ('news', 'create', 'Tin tức'),
  ('news', 'edit', 'Tin tức'),
  ('news', 'delete', 'Tin tức'),
  ('news', 'publish', 'Tin tức'),
  ('news', 'manage_seo', 'Tin tức'),
  ('news-categories', 'view', 'Danh mục tin tức'),
  ('news-categories', 'edit', 'Danh mục tin tức'),
  ('testimonials', 'view', 'Đánh giá'),
  ('testimonials', 'create', 'Đánh giá'),
  ('testimonials', 'edit', 'Đánh giá'),
  ('testimonials', 'delete', 'Đánh giá'),
  ('cms', 'view', 'Nội dung trang'),
  ('cms', 'edit', 'Nội dung trang'),
  ('banners', 'view', 'Banners'),
  ('banners', 'edit', 'Banners'),
  ('featured-sections', 'view', 'Tin nổi bật'),
  ('featured-sections', 'edit', 'Tin nổi bật'),
  ('page-builder', 'view', 'Bố cục trang'),
  ('page-builder', 'edit', 'Bố cục trang'),
  ('home-experience', 'view', 'Trải nghiệm trang chủ'),
  ('home-experience', 'edit', 'Trải nghiệm trang chủ'),
  ('pages', 'view', 'Quản lý trang'),
  ('pages', 'edit', 'Quản lý trang'),
  ('neighborhoods', 'view', 'Khu dân cư'),
  ('neighborhoods', 'create', 'Khu dân cư'),
  ('neighborhoods', 'edit', 'Khu dân cư'),
  ('neighborhoods', 'delete', 'Khu dân cư'),
  ('menu', 'view', 'Menu điều hướng'),
  ('menu', 'edit', 'Menu điều hướng'),
  ('seo-geo', 'view', 'SEO / GEO'),
  ('seo-geo', 'edit', 'SEO / GEO'),
  ('settings', 'view', 'Cài đặt'),
  ('settings', 'edit', 'Cài đặt'),
  ('footer', 'view', 'Footer'),
  ('footer', 'edit', 'Footer'),
  ('backup', 'view', 'Sao lưu dữ liệu'),
  ('backup', 'create', 'Sao lưu dữ liệu'),
  ('ai-analytics', 'view', 'AI Phân tích'),
  ('google-analytics', 'view', 'Thống kê website'),
  ('ai-chat', 'view', 'Đào tạo AI'),
  ('ai-chat', 'edit', 'Đào tạo AI'),
  ('ai-rag', 'view', 'RAG / Tri thức AI'),
  ('ai-rag', 'edit', 'RAG / Tri thức AI')
ON CONFLICT (module, action) DO UPDATE SET label = EXCLUDED.label;

CREATE OR REPLACE FUNCTION public.staff_permission_scope_matches(
  p_scope_kind text,
  p_scope_id uuid,
  p_area_id uuid DEFAULT NULL,
  p_district_id uuid DEFAULT NULL,
  p_ward_id uuid DEFAULT NULL,
  p_neighborhood_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_scope_kind
    WHEN 'global' THEN true
    WHEN 'area' THEN p_scope_id IS NOT NULL AND (
      p_scope_id = p_area_id
      OR EXISTS (
        SELECT 1 FROM public.districts d
        WHERE d.id = p_district_id AND d.area_id = p_scope_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.wards w
        JOIN public.districts d ON d.id = w.district_id
        WHERE w.id = p_ward_id AND d.area_id = p_scope_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.neighborhoods n
        JOIN public.wards w ON w.id = n.ward_id
        JOIN public.districts d ON d.id = w.district_id
        WHERE n.id = p_neighborhood_id AND d.area_id = p_scope_id
      )
    )
    WHEN 'district' THEN p_scope_id IS NOT NULL AND (
      p_scope_id = p_district_id
      OR EXISTS (
        SELECT 1 FROM public.wards w
        WHERE w.id = p_ward_id AND w.district_id = p_scope_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.neighborhoods n
        JOIN public.wards w ON w.id = n.ward_id
        WHERE n.id = p_neighborhood_id AND w.district_id = p_scope_id
      )
    )
    WHEN 'ward' THEN p_scope_id IS NOT NULL AND (
      p_scope_id = p_ward_id
      OR EXISTS (
        SELECT 1 FROM public.neighborhoods n
        WHERE n.id = p_neighborhood_id AND n.ward_id = p_scope_id
      )
    )
    WHEN 'neighborhood' THEN p_scope_id IS NOT NULL AND p_scope_id = p_neighborhood_id
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_staff_permission(
  p_module text,
  p_action text,
  p_area_id uuid DEFAULT NULL,
  p_district_id uuid DEFAULT NULL,
  p_ward_id uuid DEFAULT NULL,
  p_neighborhood_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.staff_permission_assignments a
      JOIN public.profiles p ON p.id = a.staff_user_id AND p.role = 'staff'
      WHERE a.staff_user_id = auth.uid()
        AND a.module = p_module
        AND a.action = p_action
        AND public.staff_permission_scope_matches(
          a.scope_kind,
          a.scope_id,
          p_area_id,
          p_district_id,
          p_ward_id,
          p_neighborhood_id
        )
        AND (a.updated_at IS NULL OR a.updated_at <= now())
    );
$$;

CREATE OR REPLACE FUNCTION public.get_my_staff_permissions()
RETURNS TABLE(module text, action text, scope_kind text, scope_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.module, a.action, a.scope_kind, a.scope_id
  FROM public.staff_permission_assignments a
  JOIN public.profiles p ON p.id = a.staff_user_id AND p.role = 'staff'
  WHERE a.staff_user_id = auth.uid()
  ORDER BY a.module, a.action, a.scope_kind, a.scope_id;
$$;

CREATE OR REPLACE FUNCTION public.get_staff_permissions(p_staff_user_id uuid)
RETURNS TABLE(module text, action text, scope_kind text, scope_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được xem phân quyền nhân viên' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT a.module, a.action, a.scope_kind, a.scope_id
  FROM public.staff_permission_assignments a
  WHERE a.staff_user_id = p_staff_user_id
  ORDER BY a.module, a.action, a.scope_kind, a.scope_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_staff_permissions(
  p_staff_user_id uuid,
  p_permissions jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  item jsonb;
  v_count integer;
  v_module text;
  v_action text;
  v_scope_kind text;
  v_scope_id uuid;
  v_snapshot jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được cấp quyền nhân viên' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_user_id AND role = 'staff') THEN
    RAISE EXCEPTION 'Chỉ tài khoản staff mới được cấp quyền' USING ERRCODE = '22023';
  END IF;
  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'array' THEN
    RAISE EXCEPTION 'Danh sách quyền không hợp lệ' USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_permissions)
  LOOP
    IF jsonb_typeof(item) <> 'object' THEN
      RAISE EXCEPTION 'Một quyền không hợp lệ' USING ERRCODE = '22023';
    END IF;
    v_module := item->>'module';
    v_action := item->>'action';
    v_scope_kind := COALESCE(item->>'scope_kind', 'global');
    v_scope_id := NULLIF(item->>'scope_id', '')::uuid;

    IF NOT EXISTS (
      SELECT 1 FROM public.staff_permission_catalog
      WHERE module = v_module AND action = v_action
    ) THEN
      RAISE EXCEPTION 'Module/action không nằm trong catalog' USING ERRCODE = '22023';
    END IF;
    IF v_scope_kind NOT IN ('global', 'area', 'district', 'ward', 'neighborhood') THEN
      RAISE EXCEPTION 'Cấp khu vực không hợp lệ' USING ERRCODE = '22023';
    END IF;
    IF v_scope_kind = 'global' AND v_scope_id IS NOT NULL THEN
      RAISE EXCEPTION 'Quyền toàn quốc không nhận scope_id' USING ERRCODE = '22023';
    END IF;
    IF v_scope_kind <> 'global' AND v_scope_id IS NULL THEN
      RAISE EXCEPTION 'Quyền theo khu vực phải có scope_id' USING ERRCODE = '22023';
    END IF;
    IF v_scope_kind = 'area' AND NOT EXISTS (SELECT 1 FROM public.areas WHERE id = v_scope_id) THEN
      RAISE EXCEPTION 'Tỉnh/thành không tồn tại' USING ERRCODE = '22023';
    ELSIF v_scope_kind = 'district' AND NOT EXISTS (SELECT 1 FROM public.districts WHERE id = v_scope_id) THEN
      RAISE EXCEPTION 'Quận/huyện không tồn tại' USING ERRCODE = '22023';
    ELSIF v_scope_kind = 'ward' AND NOT EXISTS (SELECT 1 FROM public.wards WHERE id = v_scope_id) THEN
      RAISE EXCEPTION 'Phường/xã không tồn tại' USING ERRCODE = '22023';
    ELSIF v_scope_kind = 'neighborhood' AND NOT EXISTS (SELECT 1 FROM public.neighborhoods WHERE id = v_scope_id) THEN
      RAISE EXCEPTION 'Khu dân cư không tồn tại' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  DELETE FROM public.staff_permission_assignments WHERE staff_user_id = p_staff_user_id;
  INSERT INTO public.staff_permission_assignments(staff_user_id, module, action, scope_kind, scope_id, granted_by)
  SELECT p_staff_user_id, item->>'module', item->>'action',
         COALESCE(item->>'scope_kind', 'global'), NULLIF(item->>'scope_id', '')::uuid, auth.uid()
  FROM jsonb_array_elements(p_permissions) item;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  SELECT COALESCE(jsonb_agg(to_jsonb(a) - 'id' - 'granted_by' - 'created_at' - 'updated_at'), '[]'::jsonb)
  INTO v_snapshot
  FROM public.staff_permission_assignments a
  WHERE a.staff_user_id = p_staff_user_id;
  INSERT INTO public.staff_permission_audit(staff_user_id, actor_id, operation, permission_snapshot)
  VALUES (p_staff_user_id, auth.uid(), 'replace', v_snapshot);
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_staff_with_permission(p_module text, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_staff_permission(p_module, p_action);
$$;

REVOKE ALL ON TABLE public.staff_permission_catalog, public.staff_permission_assignments, public.staff_permission_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_permission_scope_matches(text, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_staff_permission(text, text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_staff_permissions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_staff_permissions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_staff_permissions(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin_or_staff_with_permission(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(text, text, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_staff_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_staff_permissions(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_staff_with_permission(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
