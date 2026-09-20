-- READ ONLY. Chỉ chạy sau khi người dùng đã áp migrations/deploy và tự duyệt sync.
-- Script không gọi cron/RPC reconcile/Google và không bật lịch.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT p.oid::regprocedure AS function_name, p.prosecdef AS security_definer,
       p.proconfig AS settings, md5(p.prosrc) AS definition_fingerprint,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute,
       has_function_privilege('postgres', p.oid, 'EXECUTE') AS postgres_execute
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN
  ('refresh_search_visibility_eligibility', 'reconcile_search_visibility_snapshot');
-- Mong đợi: wrapper definer/postgres-only; reconcile invoker/service_role,
-- anon/authenticated đều false. Fingerprint phải đối chiếu bản migration đã duyệt.
SELECT jobid, jobname, schedule, active, username, md5(command) AS command_fingerprint
FROM cron.job WHERE jobname = 'search-visibility-auto-sync';
SELECT count(*) AS named_secret_count,
       count(*) FILTER (WHERE octet_length(btrim(decrypted_secret)) >= 32) AS valid_length_count
FROM vault.decrypted_secrets WHERE name = 'search_visibility_cron_secret';

SELECT id, run_type, status, started_at, finished_at, requested_count, processed_count,
       succeeded_count, failed_count, request_fingerprint,
       metadata->'snapshotReconcile'->>'snapshotFingerprint' AS snapshot_fingerprint,
       metadata->'snapshotReconcile'->'retiredKeys' AS retired_source_keys,
       metadata->'summary' AS summary
FROM public.search_visibility_runs WHERE run_type = 'eligibility_sync'
ORDER BY started_at DESC, id DESC LIMIT 10;
SELECT source_key, canonical_path, canonical_url, eligible, reason_code,
       sitemap_status, inspection_status, last_inspected_at, evidence_observed_at
FROM public.search_visibility_urls
WHERE split_part(source_key, ':', 1) IN ('area', 'area_listing', 'locality_news')
ORDER BY source_key;
SELECT count(*) AS invalid_canonical_pairs
FROM public.search_visibility_urls
WHERE canonical_url IS NOT NULL
  AND canonical_url IS DISTINCT FROM 'https://chonhaviet.com' || canonical_path;
SELECT count(*) AS invalid_eligible_rows FROM public.search_visibility_urls
WHERE eligible AND (canonical_url IS NULL OR reason_code <> 'ELIGIBLE');
SELECT canonical_url, array_agg(source_key ORDER BY source_key) AS conflicting_keys
FROM public.search_visibility_urls WHERE canonical_url IS NOT NULL
GROUP BY canonical_url HAVING count(*) > 1;
-- Đối chiếu exact key set và evidence với preflight/metadata của run được duyệt.
-- Không có run succeeded mới + fingerprint đúng thì chưa chứng minh sync hoạt động.
-- Metadata/grants không chứng minh hai chặng secret khớp hoặc Edge đã deploy;
-- cần kiểm HTTP riêng đã được cho phép, không ghi secret vào log/screenshot.
ROLLBACK;
