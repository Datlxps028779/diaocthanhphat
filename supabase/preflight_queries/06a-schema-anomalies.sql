-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

WITH schema_rows AS (
  SELECT 'properties'::text AS source, p.id, p.is_active AS public_active, p.schema_markup
  FROM public.properties p
  WHERE p.schema_markup IS NOT NULL
  UNION ALL
  SELECT 'user_listings', l.id, l.status = 'approved', l.schema_markup
  FROM public.user_listings l
  WHERE l.schema_markup IS NOT NULL
), schema_checks AS (
  SELECT s.*,
    c.check_code, c.severity, c.is_violation, c.notes
  FROM schema_rows s
  CROSS JOIN LATERAL (VALUES
    ('schema_not_object', 'high', jsonb_typeof(s.schema_markup) IS DISTINCT FROM 'object', 'schema_markup phải là JSON object'),
    ('schema_oversized', 'high', octet_length(s.schema_markup::text) > 50000, 'schema_markup vượt giới hạn 50KB'),
    ('schema_unsafe_url', 'high', s.schema_markup::text ~* '(javascript:|vbscript:|data:text/html)', 'schema chứa URL scheme nguy hiểm'),
    ('schema_invalid_property_type', 'medium', (s.schema_markup ->> '@type') IS NOT NULL AND (s.schema_markup ->> '@type') NOT IN ('RealEstateListing', 'Offer', 'Residence', 'Place', 'VideoObject', 'BreadcrumbList'), 'schema @type ngoài allow-list property'),
    ('schema_missing_type', 'medium', (s.schema_markup ->> '@type') IS NULL, 'schema custom thiếu @type')
  ) AS c(check_code, severity, is_violation, notes)
)
SELECT now() AS measured_at, source, id, check_code, severity,
       CASE WHEN public_active THEN 'public_active' ELSE 'all' END AS scope,
       1::bigint AS row_count,
       notes
FROM schema_checks
WHERE is_violation
ORDER BY source, severity DESC, check_code, id;

ROLLBACK;
