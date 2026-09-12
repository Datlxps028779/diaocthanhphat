-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

SELECT now() AS measured_at, 'properties' AS source,
       'legacy_verification_flag' AS check_code,
       'medium' AS severity,
       'all' AS scope,
       count(*) FILTER (WHERE p.is_verified)::bigint AS row_count,
       'Legacy is_verified chỉ là compatibility data; không tự tạo evidence, scope hoặc public claim' AS notes
FROM public.properties p
WHERE p.is_verified;

ROLLBACK;
