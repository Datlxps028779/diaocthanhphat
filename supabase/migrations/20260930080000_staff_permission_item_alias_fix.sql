-- Fix PL/pgSQL ambiguity in replace_staff_permissions(): the original function
-- used `item` both as a declared variable and as a SQL relation alias.
-- This replacement keeps the same signature, guards, atomicity, audit, and ACL.

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
  v_item jsonb;
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS target_profile
    WHERE target_profile.id = p_staff_user_id
      AND target_profile.role = 'staff'
  ) THEN
    RAISE EXCEPTION 'Chỉ tài khoản staff mới được cấp quyền' USING ERRCODE = '22023';
  END IF;
  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'array' THEN
    RAISE EXCEPTION 'Danh sách quyền không hợp lệ' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT permission_json.value
    FROM jsonb_array_elements(p_permissions) AS permission_json(value)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Một quyền không hợp lệ' USING ERRCODE = '22023';
    END IF;
    v_module := v_item->>'module';
    v_action := v_item->>'action';
    v_scope_kind := COALESCE(v_item->>'scope_kind', 'global');
    v_scope_id := NULLIF(v_item->>'scope_id', '')::uuid;

    IF NOT EXISTS (
      SELECT 1
      FROM public.staff_permission_catalog AS catalog
      WHERE catalog.module = v_module
        AND catalog.action = v_action
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
    IF v_scope_kind = 'area' AND NOT EXISTS (
      SELECT 1 FROM public.areas AS area_scope WHERE area_scope.id = v_scope_id
    ) THEN
      RAISE EXCEPTION 'Tỉnh/thành không tồn tại' USING ERRCODE = '22023';
    ELSIF v_scope_kind = 'district' AND NOT EXISTS (
      SELECT 1 FROM public.districts AS district_scope WHERE district_scope.id = v_scope_id
    ) THEN
      RAISE EXCEPTION 'Quận/huyện không tồn tại' USING ERRCODE = '22023';
    ELSIF v_scope_kind = 'ward' AND NOT EXISTS (
      SELECT 1 FROM public.wards AS ward_scope WHERE ward_scope.id = v_scope_id
    ) THEN
      RAISE EXCEPTION 'Phường/xã không tồn tại' USING ERRCODE = '22023';
    ELSIF v_scope_kind = 'neighborhood' AND NOT EXISTS (
      SELECT 1 FROM public.neighborhoods AS neighborhood_scope WHERE neighborhood_scope.id = v_scope_id
    ) THEN
      RAISE EXCEPTION 'Khu dân cư không tồn tại' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  DELETE FROM public.staff_permission_assignments AS assignment
  WHERE assignment.staff_user_id = p_staff_user_id;

  INSERT INTO public.staff_permission_assignments(
    staff_user_id,
    module,
    action,
    scope_kind,
    scope_id,
    granted_by
  )
  SELECT
    p_staff_user_id,
    permission_json.value->>'module',
    permission_json.value->>'action',
    COALESCE(permission_json.value->>'scope_kind', 'global'),
    NULLIF(permission_json.value->>'scope_id', '')::uuid,
    auth.uid()
  FROM jsonb_array_elements(p_permissions) AS permission_json(value);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(assignment) - 'id' - 'granted_by' - 'created_at' - 'updated_at'),
    '[]'::jsonb
  )
  INTO v_snapshot
  FROM public.staff_permission_assignments AS assignment
  WHERE assignment.staff_user_id = p_staff_user_id;

  INSERT INTO public.staff_permission_audit(
    staff_user_id,
    actor_id,
    operation,
    permission_snapshot
  )
  VALUES (p_staff_user_id, auth.uid(), 'replace', v_snapshot);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_staff_permissions(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_staff_permissions(uuid, jsonb)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
