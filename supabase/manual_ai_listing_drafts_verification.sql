-- P10 AI Listing: verification read-only sau khi người dùng tự chạy migration.
-- Chỉ chạy trong Supabase SQL Editor; không có câu lệnh INSERT/UPDATE/DELETE/DDL.

-- 1) Cột bản nháp/provenance phải tồn tại đúng trên user_listings, không nằm trên properties.
SELECT
  'user_listings_columns' AS check_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_listings'
  AND column_name IN ('ai_provenance', 'ai_seo_draft', 'tags', 'meta_title', 'meta_description')
ORDER BY column_name;

SELECT
  'public_properties_ai_columns' AS check_name,
  count(*)::int AS unexpected_ai_columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'properties'
  AND column_name IN ('ai_provenance', 'ai_seo_draft');

-- 2) Constraint hình dạng tối thiểu và RPC apply/reject/approve.
SELECT
  'p10_constraints' AS check_name,
  conname,
  convalidated
FROM pg_constraint
WHERE conrelid = 'public.user_listings'::regclass
  AND conname IN ('user_listings_ai_provenance_array', 'user_listings_ai_seo_draft_object')
ORDER BY conname;

SELECT
  'p10_functions' AS check_name,
  p.proname,
  p.prosecdef AS security_definer,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'admin_apply_user_listing_ai_seo',
    'admin_reject_user_listing_ai_seo',
    'approve_user_listing'
  )
ORDER BY p.proname;

-- 3) Chỉ authenticated được gọi RPC; quyền kiểm tra admin/staff nằm trong function.
SELECT
  'p10_rpc_grants' AS check_name,
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name IN (
    'admin_apply_user_listing_ai_seo',
    'admin_reject_user_listing_ai_seo',
    'approve_user_listing'
  )
ORDER BY routine_name, grantee, privilege_type;

-- 4) RLS/policy hiện hữu: draft phải chịu cùng boundary của user_listings,
-- public properties không được có policy đọc provenance/draft (vì hai cột này không tồn tại).
SELECT
  'user_listings_rls' AS check_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'user_listings';

SELECT
  'user_listings_policies' AS check_name,
  policyname,
  cmd,
  roles::text
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_listings'
ORDER BY policyname;

-- 5) Aggregate lifecycle safety: draft chỉ còn ở listing pending; không trả nội dung/PII.
-- Dùng to_jsonb để file vẫn chạy được và báo column_present=false nếu migration chưa chạy.
WITH schema_check AS (
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_listings'
      AND column_name = 'ai_seo_draft'
  ) AS column_present
)
SELECT
  'draft_lifecycle_aggregate' AS check_name,
  schema_check.column_present,
  count(*) FILTER (WHERE to_jsonb(ul)->>'ai_seo_draft' IS NOT NULL)::int AS total_unprocessed_seo_drafts,
  count(*) FILTER (WHERE to_jsonb(ul)->>'ai_seo_draft' IS NOT NULL AND ul.status = 'pending')::int AS pending_seo_drafts,
  count(*) FILTER (WHERE to_jsonb(ul)->>'ai_seo_draft' IS NOT NULL AND ul.status <> 'pending')::int AS non_pending_seo_drafts
FROM public.user_listings ul
CROSS JOIN schema_check
GROUP BY schema_check.column_present;

WITH schema_check AS (
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_listings'
      AND column_name = 'ai_seo_draft'
  ) AS column_present
)
SELECT
  'draft_public_link_aggregate' AS check_name,
  schema_check.column_present,
  count(*) FILTER (WHERE to_jsonb(ul)->>'ai_seo_draft' IS NOT NULL)::int AS drafts_with_public_property_link
FROM public.user_listings ul
JOIN public.properties p ON p.id = ul.property_id
CROSS JOIN schema_check
GROUP BY schema_check.column_present;

-- 6) Kiểm tra function body có chặn draft trước publish và có nhánh giữ identity.
SELECT
  'approve_function_guards' AS check_name,
  position('ai_seo_draft IS NOT NULL' IN pg_get_functiondef(p.oid)) > 0 AS blocks_unprocessed_seo_draft,
  position('v_prior_property_found' IN pg_get_functiondef(p.oid)) > 0 AS preserves_reapproval_identity_guard,
  position('SET search_path = public, pg_temp' IN pg_get_functiondef(p.oid)) > 0 AS fixed_search_path
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'approve_user_listing'
  AND pg_get_function_identity_arguments(p.oid) = 'p_listing_id uuid';
