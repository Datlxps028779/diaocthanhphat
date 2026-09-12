-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

WITH lifecycle AS (
  SELECT l.id AS listing_id, l.status, l.property_id, l.expires_at,
         p.id IS NOT NULL AS property_exists, coalesce(p.is_active, false) AS property_active
  FROM public.user_listings l
  LEFT JOIN public.properties p ON p.id = l.property_id
)
SELECT now() AS measured_at, 'user_listings' AS source,
       check_code, severity, scope, count(*)::bigint AS row_count, notes
FROM lifecycle
CROSS JOIN LATERAL (VALUES
  ('approved_without_property', 'high', CASE WHEN status = 'approved' THEN 'public_active' ELSE 'all' END,
   status = 'approved' AND (property_id IS NULL OR NOT property_exists), 'Approved listing thiếu property identity'),
  ('approved_without_active_property', 'high', 'public_active',
   status = 'approved' AND NOT property_active, 'Approved listing không có property đang active'),
  ('non_approved_with_active_property', 'medium', 'all',
   status <> 'approved' AND property_active, 'Listing chưa approved nhưng property vẫn active'),
  ('approved_expired', 'high', 'public_active',
   status = 'approved' AND expires_at IS NOT NULL AND expires_at <= now(), 'Approved listing đã quá hạn nhưng còn trạng thái approved'),
  ('approved_missing_expiry', 'medium', 'public_active',
   status = 'approved' AND expires_at IS NULL, 'Approved listing không có expires_at để kiểm soát vòng đời')
) AS checks(check_code, severity, scope, is_violation, notes)
WHERE is_violation
GROUP BY check_code, severity, scope, notes
ORDER BY severity DESC, check_code;

ROLLBACK;
