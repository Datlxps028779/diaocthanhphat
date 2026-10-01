-- Commerce prerequisite: listing/property integrity dry-run. READ ONLY.
-- Run by the product owner in the production SQL editor.
-- This identifies rows that would block paid entitlement enforcement.
-- It never updates, deletes, links or unpublishes anything.

-- 1) Summary of integrity gaps.
SELECT jsonb_build_object(
  'approved_without_property', count(*) FILTER (WHERE l.property_id IS NULL),
  'approved_with_inactive_property', count(*) FILTER (
    WHERE l.property_id IS NOT NULL AND COALESCE(p.is_active, false) = false
  ),
  'approved_with_active_property', count(*) FILTER (
    WHERE l.property_id IS NOT NULL AND p.is_active = true
  ),
  'approved_total', count(*),
  'measured_at', now(),
  'note', 'Read-only candidate inventory; no remediation was performed.'
) AS listing_property_integrity_summary
FROM public.user_listings l
LEFT JOIN public.properties p ON p.id = l.property_id
WHERE l.status = 'approved';

-- 2) Approved listings without property linkage.
-- Review the owner/admin workflow before deciding whether to relink, reject,
-- or preserve as an exceptional legacy record.
SELECT
  l.id AS listing_id,
  l.user_id AS owner_id,
  l.status,
  l.created_at,
  l.updated_at,
  l.expires_at
FROM public.user_listings l
WHERE l.status = 'approved'
  AND l.property_id IS NULL
ORDER BY l.created_at, l.id;

-- 3) Approved listings whose linked property is not active.
-- Review whether the property should be reactivated, the listing unpublished,
-- or the linkage corrected. Do not infer the remedy from this query alone.
SELECT
  l.id AS listing_id,
  l.user_id AS owner_id,
  l.property_id,
  l.status AS listing_status,
  p.is_active AS property_is_active,
  l.created_at AS listing_created_at,
  l.updated_at AS listing_updated_at,
  l.expires_at
FROM public.user_listings l
JOIN public.properties p ON p.id = l.property_id
WHERE l.status = 'approved'
  AND p.is_active = false
ORDER BY l.updated_at DESC, l.id;

-- 4) Candidate linkage context, without contact fields.
-- This helps review whether a property has another approved listing before any
-- human-approved remediation is drafted.
SELECT
  l.property_id,
  count(*) AS approved_listing_count,
  count(DISTINCT l.user_id) AS owner_count,
  bool_and(COALESCE(p.is_active, false)) AS property_is_active
FROM public.user_listings l
LEFT JOIN public.properties p ON p.id = l.property_id
WHERE l.status = 'approved'
GROUP BY l.property_id
HAVING l.property_id IS NULL
    OR NOT bool_and(COALESCE(p.is_active, false))
ORDER BY approved_listing_count DESC, l.property_id;

-- 5) Structural checks relevant to entitlement enforcement.
SELECT
  count(*) FILTER (WHERE l.status = 'approved' AND l.property_id IS NULL) AS approved_missing_property,
  count(*) FILTER (
    WHERE l.status = 'approved'
      AND l.property_id IS NOT NULL
      AND p.id IS NULL
  ) AS approved_dangling_property,
  count(*) FILTER (
    WHERE l.status = 'approved'
      AND l.property_id IS NOT NULL
      AND p.is_active = false
  ) AS approved_inactive_property,
  count(*) FILTER (
    WHERE l.status = 'approved'
      AND l.expires_at IS NULL
  ) AS approved_missing_expiry
FROM public.user_listings l
LEFT JOIN public.properties p ON p.id = l.property_id;
