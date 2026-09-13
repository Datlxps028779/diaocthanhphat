-- =============================================================================
-- News slug correction — permission diagnostics, read-only
--
-- This query explains why the guarded slug update was rejected by the installed
-- staff content-permission trigger. It reads the current auth/session context,
-- the target news scope, and news view/edit permission results.
--
-- It does not update data, disable triggers, bypass permissions, call Google,
-- call AI, read RAG, claim freshness jobs, or invoke a worker.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH target AS (
  SELECT 'f551d52c-3927-4d02-83a0-8cdb5996d365'::uuid AS news_id
), article AS (
  SELECT
    n.id,
    n.title,
    n.slug,
    n.is_published,
    n.area_id,
    n.district_id,
    n.ward_id,
    n.neighborhood_id,
    n.updated_at
  FROM public.news AS n
  JOIN target AS t ON t.news_id = n.id
), permission_check AS (
  SELECT
    a.*,
    public.has_staff_permission(
      'news', 'view', a.area_id, a.district_id, a.ward_id, a.neighborhood_id
    ) AS can_view_news_scope,
    public.has_staff_permission(
      'news', 'edit', a.area_id, a.district_id, a.ward_id, a.neighborhood_id
    ) AS can_edit_news_scope,
    public.has_staff_permission(
      'news', 'publish', a.area_id, a.district_id, a.ward_id, a.neighborhood_id
    ) AS can_publish_news_scope
  FROM article AS a
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'scope', 'Chẩn đoán permission cho đúng news row; chỉ đọc.',
  'session', jsonb_build_object(
    'current_user', current_user,
    'session_user', session_user,
    'auth_uid', auth.uid(),
    'is_admin', public.is_admin()
  ),
  'article_permission_check', coalesce((
    SELECT to_jsonb(permission_check)
    FROM permission_check
  ), '{}'::jsonb),
  'interpretation', CASE
    WHEN public.is_admin()
      THEN 'Session là admin; nếu update vẫn lỗi cần kiểm tra trigger/function đang cài đặt.'
    WHEN NOT EXISTS (SELECT 1 FROM article)
      THEN 'Không đọc được target news row trong session hiện tại.'
    WHEN EXISTS (SELECT 1 FROM permission_check WHERE can_edit_news_scope)
      THEN 'Session có quyền news.edit theo scope; cần kiểm tra khác biệt giữa SQL Editor role và request context.'
    ELSE 'Session không có quyền news.edit phù hợp với scope của article. Không được bypass trigger; cần dùng admin/owner có quyền hoặc cấp permission đúng scope.'
  END,
  'does_not_mutate', true,
  'does_not_prove', 'Không liên quan đến AI/RAG và không chứng minh Google đã crawl/index URL.'
) AS search_visibility_news_slug_permission_audit;

ROLLBACK;
