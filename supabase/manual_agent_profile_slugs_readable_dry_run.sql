-- Dry-run read-only: đề xuất slug readable kèm mã ID ổn định cho toàn bộ agent_profiles.
-- Chạy sau khi đã áp dụng migration 20261007000000_agent_profile_random_slug_ids.sql,
-- 20261008000000_agent_profile_slug_one_time_change.sql và
-- 20261009000000_agent_profile_slug_helper_nullable.sql.
-- Không có INSERT/UPDATE/DELETE.

WITH source_rows AS (
  SELECT
    ap.id,
    ap.slug AS current_slug,
    ap.display_name,
    ap.status,
    ap.slug_change_count,
    (ap.slug_change_count >= 1) AS slug_locked,
    ap.created_at,
    public.agent_profile_slug_for_id(NULL, ap.display_name, ap.id) AS proposed_slug,
    EXISTS (
      SELECT 1
      FROM public.user_listings ul
      JOIN public.properties pr ON pr.id = ul.property_id
      WHERE ul.user_id = ap.user_id
        AND ul.status = 'approved'
        AND pr.is_active = true
    ) AND ap.status = 'published' AS is_indexable
  FROM public.agent_profiles ap
), classified AS (
  SELECT
    source_rows.*,
    count(*) OVER (PARTITION BY proposed_slug) AS proposed_count,
    EXISTS (
      SELECT 1
      FROM public.agent_profiles other
      WHERE other.slug = source_rows.proposed_slug
        AND other.id <> source_rows.id
    ) AS target_used_by_other,
    EXISTS (
      SELECT 1
      FROM public.agent_profile_slug_aliases alias_row
      WHERE alias_row.old_slug = source_rows.proposed_slug
        AND alias_row.agent_profile_id <> source_rows.id
    ) AS target_reserved_by_alias
  FROM source_rows
)
SELECT
  id AS profile_id,
  current_slug,
  display_name,
  status,
  slug_change_count,
  slug_locked,
  is_indexable,
  proposed_slug,
  CASE
    WHEN current_slug = proposed_slug THEN 'NO_CHANGE'
    WHEN slug_locked THEN 'LOCKED_NO_CHANGE'
    WHEN proposed_count > 1 THEN 'UNSAFE_DUPLICATE_PROPOSAL'
    WHEN target_reserved_by_alias THEN 'UNSAFE_RESERVED_ALIAS'
    WHEN target_used_by_other THEN 'UNSAFE_CURRENT_SLUG_COLLISION'
    ELSE 'SAFE_TO_UPDATE'
  END AS recommendation
FROM classified
ORDER BY created_at ASC, id ASC;

-- Đọc nhanh tổng hợp từ cùng một nguyên tắc đề xuất.
WITH proposals AS (
  SELECT
    ap.id,
    ap.slug AS current_slug,
    public.agent_profile_slug_for_id(NULL, ap.display_name, ap.id) AS proposed_slug
  FROM public.agent_profiles ap
)
SELECT
  count(*) AS total_profiles,
  count(*) FILTER (WHERE current_slug <> proposed_slug) AS profiles_needing_change,
  count(*) FILTER (WHERE current_slug = proposed_slug) AS profiles_unchanged,
  count(DISTINCT proposed_slug) AS distinct_proposed_slugs
FROM proposals;
