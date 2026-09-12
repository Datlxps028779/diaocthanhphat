-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

SELECT now() AS measured_at, 'verification_model' AS source,
       expected.object_name AS id,
       'verification_object_presence' AS check_code,
       CASE WHEN expected.object_exists THEN 'low' ELSE 'medium' END AS severity,
       'all' AS scope,
       CASE WHEN expected.object_exists THEN 1::bigint ELSE 0::bigint END AS row_count,
       CASE WHEN expected.object_exists THEN 'Object/column có mặt; cần đọc-only verify tiếp theo'
            ELSE 'UNKNOWN — object/column chưa có trên database hiện tại' END AS notes
FROM (
  SELECT 'property_verification_cases'::text AS object_name,
         to_regclass('public.property_verification_cases') IS NOT NULL AS object_exists
  UNION ALL
  SELECT 'property_verification_evidence', to_regclass('public.property_verification_evidence') IS NOT NULL
  UNION ALL
  SELECT 'property_verification_events', to_regclass('public.property_verification_events') IS NOT NULL
  UNION ALL
  SELECT 'properties.verification_status', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'verification_status'
  )
  UNION ALL
  SELECT 'properties.verification_scope_codes', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'verification_scope_codes'
  )
  UNION ALL
  SELECT 'properties.verified_until', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'verified_until'
  )
) AS expected
ORDER BY object_name;

ROLLBACK;
