-- =============================================================================
-- Homepage UI config — PREFLIGHT (chỉ đọc, chạy tay trên production)
--
-- Mục đích: trước khi admin thêm hàng `timeline` vào page_sections và trước khi
-- UI Page Builder / Trải nghiệm trang chủ ghi cấu hình, xác nhận:
--   1. Hiện trạng 10 hàng page_sections (order / visibility / settings).
--   2. Hàng `timeline` CÓ hay CHƯA có (kỳ vọng: CHƯA có).
--   3. Kiểu cột `id` (text, không phải uuid) và `order_index` (integer, không unique).
--   4. Trigger tự cập nhật `updated_at` còn hoạt động (nền tảng cho ghim phiên bản).
--   5. RLS/ACL: ai được SELECT/UPDATE/INSERT page_sections.
--
-- Không ghi, không sửa, không cấp quyền. User tự chạy trong SQL Editor.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- ─── 1. Hiện trạng cấu hình trang chủ ────────────────────────────────────────
SELECT jsonb_build_object(
  'section_count', (SELECT count(*) FROM public.page_sections),
  'has_timeline_row', EXISTS (SELECT 1 FROM public.page_sections WHERE id = 'timeline'),
  'rows', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id,
      'label', s.label,
      'is_visible', s.is_visible,
      'order_index', s.order_index,
      'settings', s.settings,
      'updated_at', s.updated_at
    ) ORDER BY s.order_index, s.id)
    FROM public.page_sections s
  ), '[]'::jsonb)
) AS homepage_ui_config;

-- ─── 2. Hàng then chốt: region_banners phải GIỮ NGUYÊN đang ẩn ──────────────
-- Preflight chỉ BÁO CÁO; migration không được bật hàng này.
SELECT jsonb_build_object(
  'region_banners', jsonb_build_object(
    'exists', EXISTS (SELECT 1 FROM public.page_sections WHERE id = 'region_banners'),
    'is_visible', (SELECT is_visible FROM public.page_sections WHERE id = 'region_banners'),
    'order_index', (SELECT order_index FROM public.page_sections WHERE id = 'region_banners'),
    'settings', (SELECT settings FROM public.page_sections WHERE id = 'region_banners')
  ),
  'featured_sections_order', (SELECT order_index FROM public.page_sections WHERE id = 'featured_sections')
) AS critical_rows;

-- ─── 3. Kiểu/ràng buộc cột (id text PK; order_index integer KHÔNG unique) ────
SELECT jsonb_build_object(
  'id', jsonb_build_object(
    'data_type', (SELECT data_type FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'page_sections' AND column_name = 'id'),
    'is_primary_key', EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'public.page_sections'::regclass AND i.indisprimary AND a.attname = 'id')
  ),
  'order_index', jsonb_build_object(
    'data_type', (SELECT data_type FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'page_sections' AND column_name = 'order_index'),
    'has_unique_index', EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'public.page_sections'::regclass AND i.indisunique AND a.attname = 'order_index')
  ),
  'updated_at_column_exists', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'page_sections' AND column_name = 'updated_at')
) AS column_shape;

-- ─── 4. Trigger updated_at (ghim phiên bản dựa vào cột này) ──────────────────
SELECT jsonb_build_object(
  'trigger_exists', EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.page_sections'::regclass
      AND tgname = 'trg_page_sections_updated_at' AND NOT tgisinternal),
  'all_triggers', coalesce((
    SELECT jsonb_agg(t.tgname ORDER BY t.tgname)
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.page_sections'::regclass AND NOT t.tgisinternal), '[]'::jsonb)
) AS updated_at_trigger;

-- ─── 5. RLS + policy + quyền bảng ────────────────────────────────────────────
SELECT jsonb_build_object(
  'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.page_sections'::regclass),
  'policies', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'name', p.polname,
      'cmd', CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                           WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE p.polcmd::text END,
      'roles', (SELECT jsonb_agg(r.rolname ORDER BY r.rolname)
                FROM unnest(p.polroles) pr(oid) JOIN pg_roles r ON r.oid = pr.oid),
      'using_expr', pg_get_expr(p.polqual, p.polrelid),
      'check_expr', pg_get_expr(p.polwithcheck, p.polrelid)
    ) ORDER BY p.polname)
    FROM pg_policy p WHERE p.polrelid = 'public.page_sections'::regclass), '[]'::jsonb),
  'table_privileges', jsonb_build_object(
    'anon_select', has_table_privilege('anon', 'public.page_sections', 'SELECT'),
    'anon_update', has_table_privilege('anon', 'public.page_sections', 'UPDATE'),
    'anon_insert', has_table_privilege('anon', 'public.page_sections', 'INSERT'),
    'authenticated_select', has_table_privilege('authenticated', 'public.page_sections', 'SELECT'),
    'authenticated_update', has_table_privilege('authenticated', 'public.page_sections', 'UPDATE'),
    'authenticated_insert', has_table_privilege('authenticated', 'public.page_sections', 'INSERT'),
    'service_role_update', has_table_privilege('service_role', 'public.page_sections', 'UPDATE')
  )
) AS rls_and_acl;

ROLLBACK;
