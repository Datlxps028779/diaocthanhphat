-- SQL 13 v3: chạy thử DDL trong subtransaction rồi tự hoàn tác, không cài chính thức.
-- Không dùng bảng tạm hoặc BEGIN/COMMIT/ROLLBACK qua nhiều câu lệnh SQL Editor.
-- Không gọi wrapper/HTTP, không ghi registry, không bật cron.
-- Job ID sequence có thể tăng dù hoàn tác. Chạy toàn bộ file một lần.
DO $dry_run$
DECLARE
  v_before_function jsonb;
  v_after_function jsonb;
  v_before_jobs jsonb;
  v_after_jobs jsonb;
  v_oid oid;
  v_verified boolean := false;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'STOP: run as postgres';
  END IF;
  -- cron.job do extension quản lý; chỉ đọc, thay lịch qua các hàm cron.*.
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'search-visibility-auto-sync') <> 1
     OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'search-visibility-auto-sync'
                AND (active OR username <> 'postgres' OR schedule <> '7,37 * * * *')) THEN
    RAISE EXCEPTION 'STOP: expected one paused postgres job with schedule 7,37';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'STOP: pg_net missing';
  END IF;
  IF (SELECT count(*) FROM vault.decrypted_secrets WHERE name = 'search_visibility_cron_secret') <> 1
     OR (SELECT count(*) FROM vault.decrypted_secrets WHERE name = 'search_visibility_cron_secret'
           AND octet_length(btrim(decrypted_secret)) >= 32) <> 1 THEN
    RAISE EXCEPTION 'STOP: Vault configuration invalid';
  END IF;

  SELECT jsonb_build_object('oid', oid, 'definition', md5(pg_get_functiondef(oid)),
                            'owner', proowner, 'acl', proacl)
    INTO v_before_function FROM pg_catalog.pg_proc
   WHERE oid = to_regprocedure('public.refresh_search_visibility_eligibility()');
  IF v_before_function IS NULL THEN
    RAISE EXCEPTION 'STOP: original wrapper missing';
  END IF;
  SELECT jsonb_agg(to_jsonb(j) ORDER BY jobid) INTO v_before_jobs
    FROM cron.job j WHERE jobname = 'search-visibility-auto-sync';

  BEGIN
    EXECUTE $migration_sql$
-- DB → Edge dùng Vault search_visibility_cron_secret; không chứa credential literal.
-- Một DO giữ DDL và thay lịch atomic, không phụ thuộc session giữa các câu lệnh.
-- Không gọi wrapper khi cài đặt. Job paused (hoặc chưa có job) tiếp tục paused.
-- Chủ sản phẩm tự chạy; bật cron là thao tác riêng sau kiểm chứng end-to-end.
DO $migration$
DECLARE
  v_was_active boolean := false;
  v_job_id bigint;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'search-visibility: migration phải chạy bằng postgres';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'search-visibility: cần cấu hình pg_cron trước khi cài wrapper';
  END IF;

  SELECT COALESCE(bool_or(active), false)
    INTO v_was_active
    FROM cron.job
   WHERE jobname = 'search-visibility-auto-sync';

  PERFORM cron.unschedule('search-visibility-auto-sync')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'search-visibility-auto-sync');

  -- Hàm cũ trả void; đổi kiểu trả về bắt buộc drop/create, không dùng CASCADE.
  EXECUTE $wrapper$
DROP FUNCTION IF EXISTS public.refresh_search_visibility_eligibility();

CREATE OR REPLACE FUNCTION public.refresh_search_visibility_eligibility()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_edge_url constant text := 'https://itgxladqskdcbwsbmuyi.supabase.co/functions/v1/sync-search-visibility';
  v_secret text;
  v_secret_count integer;
  v_request_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_net') THEN
    RAISE WARNING 'search-visibility: pg_net chưa bật, bỏ qua lượt sync.';
    RETURN -1;
  END IF;

  SELECT count(*), (array_agg(decrypted_secret))[1]
    INTO v_secret_count, v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'search_visibility_cron_secret';

  v_secret := NULLIF(btrim(v_secret), '');
  IF v_secret_count IS DISTINCT FROM 1 OR v_secret IS NULL THEN
    RAISE WARNING 'search-visibility: Vault secret thiếu, rỗng hoặc trùng bản ghi; bỏ qua lượt sync.';
    RETURN 0;
  END IF;
  IF octet_length(v_secret) < 32 THEN
    RAISE WARNING 'search-visibility: Vault secret ngắn hơn 32 byte; bỏ qua lượt sync.';
    RETURN 0;
  END IF;

  IF v_edge_url IS NULL OR v_edge_url NOT LIKE 'https://%' THEN
    RAISE WARNING 'search-visibility: Edge URL không hợp lệ; bỏ qua lượt sync.';
    RETURN 0;
  END IF;

  SELECT net.http_post(
    url := v_edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-search-visibility-cron-secret', v_secret
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;

  RAISE NOTICE 'search-visibility: đã gọi Edge sync, response_id=%', v_request_id;
  RETURN 1;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'search-visibility: không gọi được Edge sync (sqlstate=%).', SQLSTATE;
    RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.refresh_search_visibility_eligibility() IS
'Cổng cron DB→Edge. Vault search_visibility_cron_secret qua x-search-visibility-cron-secret. Fail-closed khi thiếu cấu hình; không dùng service-role key.';

REVOKE ALL ON FUNCTION public.refresh_search_visibility_eligibility() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_search_visibility_eligibility() TO postgres;
  $wrapper$;

  PERFORM cron.schedule(
    'search-visibility-auto-sync',
    '7,37 * * * *',
    $cron$ SELECT public.refresh_search_visibility_eligibility(); $cron$
  );

  IF NOT v_was_active THEN
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'search-visibility-auto-sync';
    IF v_job_id IS NULL THEN
      RAISE EXCEPTION 'search-visibility: không tìm thấy job mới để giữ paused';
    END IF;
    PERFORM cron.alter_job(job_id := v_job_id, active := false);
  END IF;
END $migration$;
    $migration_sql$;

    v_oid := 'public.refresh_search_visibility_eligibility()'::regprocedure;
    IF has_function_privilege('anon', v_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR has_function_privilege('service_role', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('postgres', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'STOP: wrapper ACL verification failed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid = v_oid
                   AND prosecdef AND prorettype = 'integer'::regtype
                   AND pg_get_userbyid(proowner) = 'postgres'
                   AND array_to_string(proconfig, ',') IN ('search_path=', 'search_path=""')
                   AND position('x-search-visibility-cron-secret' in prosrc) > 0) THEN
      RAISE EXCEPTION 'STOP: wrapper definition verification failed';
    END IF;
    IF (SELECT count(*) FROM cron.job WHERE jobname = 'search-visibility-auto-sync') <> 1
       OR NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'search-visibility-auto-sync'
                      AND NOT active AND username = 'postgres' AND schedule = '7,37 * * * *'
                      AND btrim(command) = 'SELECT public.refresh_search_visibility_eligibility();') THEN
      RAISE EXCEPTION 'STOP: cron verification failed';
    END IF;

    -- Ngoại lệ riêng chỉ xuất hiện sau khi kiểm chứng đạt, buộc hoàn tác subtransaction.
    RAISE EXCEPTION USING ERRCODE = 'ZSV01', MESSAGE = 'verified dry-run rollback';
  EXCEPTION
    WHEN SQLSTATE 'ZSV01' THEN
      v_verified := true;
  END;

  SELECT jsonb_build_object('oid', oid, 'definition', md5(pg_get_functiondef(oid)),
                            'owner', proowner, 'acl', proacl)
    INTO v_after_function FROM pg_catalog.pg_proc
   WHERE oid = to_regprocedure('public.refresh_search_visibility_eligibility()');
  SELECT jsonb_agg(to_jsonb(j) ORDER BY jobid) INTO v_after_jobs
    FROM cron.job j WHERE jobname = 'search-visibility-auto-sync';
  IF NOT v_verified OR v_before_function IS DISTINCT FROM v_after_function
     OR v_before_jobs IS DISTINCT FROM v_after_jobs THEN
    RAISE EXCEPTION 'STOP: rollback state verification failed';
  END IF;
  RAISE NOTICE 'DRY_RUN_PASS_ROLLED_BACK: wrapper/ACL và cron đã trở về trạng thái ban đầu; không gọi sync.';
END $dry_run$;

SELECT
  'POST_DRY_RUN_STATE'::text AS step,
  p.oid::regprocedure AS function_name,
  pg_get_function_result(p.oid) AS restored_return_type,
  md5(p.prosrc) AS restored_definition_fingerprint,
  j.jobid, j.schedule, j.active AS cron_active
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN cron.job j
WHERE n.nspname = 'public'
  AND p.proname = 'refresh_search_visibility_eligibility'
  AND p.pronargs = 0
  AND j.jobname = 'search-visibility-auto-sync';
