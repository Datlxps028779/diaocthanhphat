-- READ ONLY. Chủ sản phẩm tự chạy bằng postgres trước rollout; không gọi sync.
-- Không in secret, function definition hoặc cron command.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT extname, extversion FROM pg_catalog.pg_extension
WHERE extname IN ('pg_cron', 'pg_net', 'supabase_vault');
SELECT to_regclass('vault.decrypted_secrets') IS NOT NULL AS vault_available,
       to_regclass('cron.job') IS NOT NULL AS cron_available;

SELECT p.oid::regprocedure AS function_name, p.prosecdef AS security_definer,
       p.proconfig AS settings, pg_get_userbyid(p.proowner) AS owner,
       md5(p.prosrc) AS definition_fingerprint,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute,
       has_function_privilege('postgres', p.oid, 'EXECUTE') AS postgres_execute,
       position('x-search-visibility-cron-secret' in p.prosrc) > 0 AS dedicated_header_present,
       position('supabase.service_role_key' in p.prosrc) > 0 AS legacy_credential_present
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN
  ('refresh_search_visibility_eligibility', 'reconcile_search_visibility_snapshot');

-- Chỉ metadata; dừng nếu Vault/cron không tồn tại, không tự cài extension.
SELECT jobid, jobname, schedule, active, username,
       md5(command) AS command_fingerprint,
       command ~ '^\s*SELECT\s+public\.refresh_search_visibility_eligibility\(\);?\s*$' AS wrapper_only
FROM cron.job WHERE jobname = 'search-visibility-auto-sync';
SELECT count(*) AS named_secret_count,
       count(*) FILTER (WHERE octet_length(btrim(decrypted_secret)) >= 32) AS valid_length_count
FROM vault.decrypted_secrets WHERE name = 'search_visibility_cron_secret';

SELECT split_part(source_key, ':', 1) AS namespace, count(*) AS row_count,
       count(*) FILTER (WHERE eligible) AS eligible_count,
       count(*) FILTER (WHERE canonical_url IS NULL) AS released_count
FROM public.search_visibility_urls GROUP BY 1 ORDER BY 1;
SELECT canonical_url, array_agg(source_key ORDER BY source_key) AS conflicting_keys
FROM public.search_visibility_urls WHERE canonical_url IS NOT NULL
GROUP BY canonical_url HAVING count(*) > 1;
SELECT source_key, canonical_path, canonical_url, eligible, source_version
FROM public.search_visibility_urls
WHERE split_part(source_key, ':', 1) IN ('area', 'area_listing', 'locality_news')
ORDER BY source_key;

-- Chưa có manifest candidate từ snapshot đầy đủ thì KHÔNG suy ra tập retire bằng
-- SQL taxonomy gần đúng. Thay NULL bằng JSON array các source_key của snapshot đã
-- kiểm đầy đủ (không chứa credentials). [] chỉ hợp lệ khi snapshot thật sự rỗng.
-- Kết quả mặc định là BLOCKED, không được dùng để bật cron hoặc cho phép rollout.
WITH manifest AS (SELECT NULL::jsonb AS keys),
valid AS (SELECT keys FROM manifest WHERE jsonb_typeof(keys) = 'array'),
stale AS (
  SELECT u.source_key, u.canonical_url
  FROM public.search_visibility_urls u CROSS JOIN valid v
  WHERE split_part(u.source_key, ':', 1) IN ('area', 'area_listing', 'locality_news')
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v.keys) k WHERE k = u.source_key)
)
SELECT CASE WHEN EXISTS (SELECT 1 FROM valid) THEN 'REVIEW_EXACT_KEYS' ELSE 'BLOCKED_NO_COMPLETE_MANIFEST' END AS readiness,
       CASE WHEN EXISTS (SELECT 1 FROM valid) THEN (SELECT count(*) FROM stale) END AS affected_rows,
       (SELECT jsonb_agg(to_jsonb(stale) ORDER BY source_key) FROM stale) AS exact_retirement_candidates;
ROLLBACK;
