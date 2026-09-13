-- =============================================================================
-- Search Visibility Auto Sync — pg_cron + Edge Function
-- =============================================================================
-- Tự động refresh search_visibility_urls mỗi 30 phút.
--
-- APPROACH: pg_cron gọi Edge Function trực tiếp qua pg_net.
-- Edge Function có sẵn SUPABASE_URL và SERVICE_ROLE_KEY từ runtime environment,
-- không cần set database config parameters.

-- Function wrapper cho pg_cron
CREATE OR REPLACE FUNCTION refresh_search_visibility_eligibility()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_response_id bigint;
  v_supabase_url text;
BEGIN
  -- Get Supabase URL từ current database connection
  -- Format: postgresql://...@db.PROJECT_REF.supabase.co:5432/postgres
  -- Extract PROJECT_REF để build Edge Function URL
  SELECT split_part(split_part(current_setting('listen_addresses'), '.', 2), '.', 1) INTO v_supabase_url;

  -- Fallback: hardcode project ref nếu không detect được
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'itgxladqskdcbwsbmuyi';
  END IF;

  -- Call Edge Function via pg_net
  -- Edge Function tự có SERVICE_ROLE_KEY từ runtime env
  SELECT net.http_post(
    url := 'https://' || v_supabase_url || '.supabase.co/functions/v1/sync-search-visibility',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) INTO v_response_id;

  RAISE NOTICE 'Triggered search visibility sync via Edge Function, response_id: %', v_response_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger search visibility sync: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION refresh_search_visibility_eligibility() IS
'Auto-sync wrapper for pg_cron. Calls Edge Function to rebuild search_visibility_urls.';

-- Grant execute to postgres role (pg_cron chạy với role này)
GRANT EXECUTE ON FUNCTION refresh_search_visibility_eligibility() TO postgres;

-- Schedule pg_cron: mỗi 30 phút tại phút :07 và :37
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Xóa job cũ nếu có (idempotent)
    PERFORM cron.unschedule('search-visibility-auto-sync');

    -- Schedule: 7,37 * * * * = phút :07 và :37 mỗi giờ
    PERFORM cron.schedule(
      'search-visibility-auto-sync',
      '7,37 * * * *',
      $$ SELECT refresh_search_visibility_eligibility(); $$
    );

    RAISE NOTICE '✅ pg_cron scheduled: search-visibility-auto-sync mỗi 30 phút (phút :07 và :37)';
  ELSE
    RAISE WARNING '⚠️ pg_cron extension chưa bật. Bật tại Dashboard > Database > Extensions, rồi chạy lại migration.';
  END IF;
END $$;

-- Verify: Check pg_cron jobs
-- SELECT * FROM cron.job WHERE jobname = 'search-visibility-auto-sync';
