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
