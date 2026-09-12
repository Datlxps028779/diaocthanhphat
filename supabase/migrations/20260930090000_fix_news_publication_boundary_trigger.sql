-- Allow the service-role-only News publication boundary to pass the generic
-- staff-scope trigger without weakening browser/staff enforcement.
--
-- The publication RPC sets app.news_publication_boundary only after it has
-- authenticated the caller, locked the row, verified content_version and
-- accepted the SEO–GEO–AIO/citation checks. The trigger must honor that narrow
-- server boundary; otherwise SECURITY DEFINER updates are evaluated with the
-- service-role context and are rejected as if they were an unscoped staff edit.
--
-- This migration intentionally follows 20260930050000_staff_permission_enforcement.sql.
-- Production SQL is run by the user; do not apply from the application runtime.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_staff_content_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_neighborhood_id uuid;
  v_module text;
  v_area_id uuid;
  v_district_id uuid;
  v_ward_id uuid;
  v_is_published boolean;
BEGIN
  -- Narrow bypass for the server-only publication RPC. The GUC is set
  -- transaction-locally by publish_news_article_server() and is never exposed
  -- as a browser-callable function. Keep the service_role check as defense in
  -- depth so a caller cannot bypass staff scope with only a custom GUC value.
  IF current_setting('app.news_publication_boundary', true) = 'allowed'
     AND coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  v_module := TG_ARGV[0];
  IF TG_TABLE_NAME = 'properties' THEN
    v_area_id := NEW.area_id;
    v_district_id := NEW.district_id;
    v_ward_id := NEW.ward_id;
    SELECT n.id INTO v_neighborhood_id
    FROM public.neighborhoods AS n
    WHERE n.slug = NEW.neighborhood_slug
    LIMIT 1;
    v_is_published := NEW.is_active;
  ELSE
    v_area_id := NEW.area_id;
    v_district_id := NEW.district_id;
    v_ward_id := NEW.ward_id;
    v_neighborhood_id := NEW.neighborhood_id;
    v_is_published := NEW.is_published;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.has_staff_permission(v_module, 'create', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền tạo dữ liệu trong phạm vi này' USING ERRCODE = '42501';
    END IF;
    IF v_is_published AND NOT public.has_staff_permission(v_module, 'publish', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền đăng/xuất bản trong phạm vi này' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT public.has_staff_permission(v_module, 'edit', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền chỉnh sửa trong phạm vi này' USING ERRCODE = '42501';
    END IF;
    IF TG_TABLE_NAME = 'properties'
       AND v_is_published IS DISTINCT FROM (to_jsonb(OLD)->>'is_active')::boolean
       AND v_is_published
       AND NOT public.has_staff_permission(v_module, 'publish', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền đăng/xuất bản trong phạm vi này' USING ERRCODE = '42501';
    END IF;
    IF TG_TABLE_NAME = 'news'
       AND v_is_published IS DISTINCT FROM (to_jsonb(OLD)->>'is_published')::boolean
       AND v_is_published
       AND NOT public.has_staff_permission(v_module, 'publish', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền đăng/xuất bản trong phạm vi này' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_staff_content_permission() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
