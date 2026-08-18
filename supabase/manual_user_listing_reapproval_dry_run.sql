-- =============================================================================
-- P3D — Read-only dry-run / post-run verification for identity-preserving reapproval
-- =============================================================================
-- Không có INSERT/UPDATE/DELETE và không gọi approve_user_listing().

-- 1) Lifecycle và trạng thái property liên kết.
SELECT
  l.status,
  count(*) AS listing_count,
  count(*) FILTER (WHERE l.property_id IS NULL) AS without_property_id,
  count(*) FILTER (WHERE l.property_id IS NOT NULL AND p.id IS NULL) AS dangling_property_id,
  count(*) FILTER (WHERE l.status = 'approved' AND COALESCE(p.is_active, false) = false) AS approved_without_active_property,
  count(*) FILTER (WHERE l.status <> 'approved' AND COALESCE(p.is_active, false) = true) AS unpublished_with_active_property,
  count(*) FILTER (
    WHERE l.status IN ('pending', 'rejected', 'expired')
      AND p.id IS NOT NULL
      AND p.is_active = false
  ) AS identity_preserving_reapproval_candidates
FROM public.user_listings l
LEFT JOIN public.properties p ON p.id = l.property_id
GROUP BY l.status
ORDER BY l.status;

-- 2) Chi tiết candidate. Không tự sửa candidate bất thường.
SELECT
  l.id AS listing_id,
  l.status,
  l.property_id,
  p.slug,
  p.public_code,
  p.is_active,
  l.expires_at,
  l.updated_at,
  count(other_listing.id) AS other_listing_references
FROM public.user_listings l
JOIN public.properties p ON p.id = l.property_id
LEFT JOIN public.user_listings other_listing
  ON other_listing.property_id = l.property_id
 AND other_listing.id <> l.id
WHERE l.status IN ('pending', 'rejected', 'expired')
GROUP BY l.id, l.status, l.property_id, p.slug, p.public_code, p.is_active, l.expires_at, l.updated_at
ORDER BY l.updated_at DESC, l.id;

-- 3) Shared property links phải làm RPC fail closed.
SELECT
  property_id,
  count(*) AS listing_references,
  array_agg(id ORDER BY created_at, id) AS listing_ids
FROM public.user_listings
WHERE property_id IS NOT NULL
GROUP BY property_id
HAVING count(*) > 1
ORDER BY listing_references DESC, property_id;

-- 4) Fingerprint trùng chỉ để review; không merge/delete tự động.
SELECT
  title,
  city,
  COALESCE(district, '') AS district,
  COALESCE(address, '') AS address,
  price,
  count(*) AS property_count,
  array_agg(id ORDER BY created_at DESC, id) AS property_ids
FROM public.properties
GROUP BY title, city, COALESCE(district, ''), COALESCE(address, ''), price
HAVING count(*) > 1
ORDER BY property_count DESC, title
LIMIT 100;

-- 5) Inactive properties không còn user_listing hiện tại tham chiếu. Có thể là Admin
-- inventory hợp lệ hoặc lịch sử cũ; không được xem là orphan để tự xóa.
SELECT
  p.id,
  p.slug,
  p.public_code,
  p.title,
  p.created_at,
  p.updated_at
FROM public.properties p
LEFT JOIN public.user_listings l ON l.property_id = p.id
WHERE p.is_active = false
  AND l.id IS NULL
ORDER BY p.updated_at DESC, p.id
LIMIT 100;

-- 6) Downstream references của property đang liên kết. Giữ nguyên property id sẽ giữ
-- nguyên các FK này khi duyệt lại.
WITH linked AS (
  SELECT DISTINCT property_id
  FROM public.user_listings
  WHERE property_id IS NOT NULL
)
SELECT
  linked.property_id,
  (SELECT count(*) FROM public.leads x WHERE x.property_id = linked.property_id) AS leads,
  (SELECT count(*) FROM public.property_favorites x WHERE x.property_id = linked.property_id) AS property_favorites,
  (SELECT count(*) FROM public.user_favorites x WHERE x.property_id = linked.property_id) AS user_favorites,
  (SELECT count(*) FROM public.chat_sessions x WHERE x.property_id = linked.property_id) AS chat_sessions,
  (SELECT count(*) FROM public.featured_section_items x WHERE x.property_id = linked.property_id) AS featured_section_items,
  (SELECT count(*) FROM public.user_listing_lifecycle_events x WHERE x.property_id = linked.property_id) AS lifecycle_events
FROM linked
ORDER BY linked.property_id;

-- 7) Sau migration: function phải giữ signature/ACL/search path cũ.
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config,
  pg_get_userbyid(p.proowner) AS owner,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  pg_get_functiondef(p.oid) ILIKE '%UPDATE public.properties%' AS has_identity_reactivation_path
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'approve_user_listing';

-- 8) Lifecycle/unpublish triggers phải còn nguyên.
SELECT
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'user_listings'
  AND t.tgname IN (
    'trg_hide_property_on_unpublish',
    'trg_user_listing_lifecycle_event'
  )
  AND NOT t.tgisinternal
ORDER BY t.tgname;
