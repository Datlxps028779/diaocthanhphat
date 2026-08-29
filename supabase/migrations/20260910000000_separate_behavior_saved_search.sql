-- =============================================================================
-- Tách behavior tracking khỏi saved search
-- =============================================================================
-- user_taste_signals: dữ liệu hệ thống tự ghi để học hành vi.
-- user_saved_searches: dữ liệu legacy, không còn là một bề mặt người dùng.
-- Migration không xóa dữ liệu cũ; chỉ cô lập auto-save, khóa alert và cung cấp
-- RPC sliding-window để đồng bộ behavior an toàn giữa nhiều tab/thiết bị.

ALTER TABLE public.user_saved_searches
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'automatic';

ALTER TABLE public.user_saved_searches
  DROP CONSTRAINT IF EXISTS user_saved_searches_origin_check;

ALTER TABLE public.user_saved_searches
  ADD CONSTRAINT user_saved_searches_origin_check
  CHECK (origin IN ('automatic', 'explicit'));

-- Production dry-run ngày 2026-08-29: 6/6 row đều daily + alert_enabled,
-- chưa row nào có last_notified_at. Giữ row để audit nhưng vô hiệu hóa hoàn toàn.
UPDATE public.user_saved_searches
SET origin = 'automatic',
    alert_enabled = false
WHERE origin = 'automatic';

ALTER TABLE public.user_saved_searches
  ALTER COLUMN alert_enabled SET DEFAULT false;

ALTER TABLE public.user_saved_searches
  DROP CONSTRAINT IF EXISTS user_saved_searches_automatic_alert_disabled;

ALTER TABLE public.user_saved_searches
  ADD CONSTRAINT user_saved_searches_automatic_alert_disabled
  CHECK (origin <> 'automatic' OR alert_enabled = false);

CREATE INDEX IF NOT EXISTS idx_user_saved_searches_user_origin_created
  ON public.user_saved_searches(user_id, origin, created_at DESC);

-- Client cũ không được tiếp tục sinh automatic rows sau khi migration đã chạy.
DROP POLICY IF EXISTS "uss_select" ON public.user_saved_searches;
CREATE POLICY "uss_select" ON public.user_saved_searches FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND origin = 'explicit');

DROP POLICY IF EXISTS "uss_insert" ON public.user_saved_searches;
CREATE POLICY "uss_insert" ON public.user_saved_searches FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND origin = 'explicit');

DROP POLICY IF EXISTS "uss_update" ON public.user_saved_searches;
CREATE POLICY "uss_update" ON public.user_saved_searches FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND origin = 'explicit')
  WITH CHECK (auth.uid() = user_id AND origin = 'explicit');

DROP POLICY IF EXISTS "uss_delete" ON public.user_saved_searches;
CREATE POLICY "uss_delete" ON public.user_saved_searches FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND origin = 'explicit');

ALTER TABLE public.user_taste_signals
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_taste_signals_event
  ON public.user_taste_signals(user_id, event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_taste_signals_recent_dedupe
  ON public.user_taste_signals(user_id, kind, dedupe_key, ts DESC);

-- Mọi remote write phải qua RPC để dedupe/validation không bị bypass.
DROP POLICY IF EXISTS "uts_insert" ON public.user_taste_signals;
REVOKE INSERT ON TABLE public.user_taste_signals FROM authenticated;

CREATE OR REPLACE FUNCTION public.record_user_taste_signal(
  p_kind text,
  p_event_id uuid,
  p_area_id uuid DEFAULT NULL,
  p_type_id uuid DEFAULT NULL,
  p_listing_type text DEFAULT NULL,
  p_price numeric DEFAULT NULL,
  p_dedupe_key text DEFAULT NULL,
  p_dedupe_window_seconds integer DEFAULT 1800
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_window_seconds integer := GREATEST(60, LEAST(COALESCE(p_dedupe_window_seconds, 1800), 86400));
  v_dedupe_key text := NULLIF(btrim(p_dedupe_key), '');
  v_existing_event_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_kind NOT IN ('search', 'view', 'favorite', 'contact') THEN
    RAISE EXCEPTION 'Unsupported taste signal kind';
  END IF;

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'Taste signal requires event id';
  END IF;

  -- Cùng event local+remote/retry chỉ được ghi một lần.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':event:' || p_event_id::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.user_taste_signals s
    WHERE s.user_id = v_user_id
      AND s.event_id = p_event_id
  ) THEN
    RETURN p_event_id;
  END IF;

  IF p_area_id IS NULL
     AND p_type_id IS NULL
     AND NULLIF(btrim(p_listing_type), '') IS NULL
     AND COALESCE(p_price, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  IF p_kind = 'search' THEN
    IF v_dedupe_key IS NULL THEN
      RAISE EXCEPTION 'Search signal requires dedupe key';
    END IF;

    -- Cùng user + intent được tuần tự hóa để hai tab không cùng insert.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':' || v_dedupe_key, 0)
    );

    SELECT s.event_id
    INTO v_existing_event_id
    FROM public.user_taste_signals s
    WHERE s.user_id = v_user_id
      AND s.kind = 'search'
      AND s.dedupe_key = v_dedupe_key
      AND s.ts >= v_now - make_interval(secs => v_window_seconds)
    ORDER BY s.ts DESC
    LIMIT 1;

    IF v_existing_event_id IS NOT NULL THEN
      RETURN v_existing_event_id;
    END IF;
  END IF;

  INSERT INTO public.user_taste_signals (
    user_id, event_id, kind, area_id, type_id, listing_type, price, ts, dedupe_key
  ) VALUES (
    v_user_id,
    p_event_id,
    p_kind,
    p_area_id,
    p_type_id,
    NULLIF(btrim(p_listing_type), ''),
    CASE WHEN COALESCE(p_price, 0) > 0 THEN p_price ELSE NULL END,
    v_now,
    CASE WHEN p_kind = 'search' THEN v_dedupe_key ELSE NULL END
  );

  RETURN p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_taste_signal(text, uuid, uuid, uuid, text, numeric, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_user_taste_signal(text, uuid, uuid, uuid, text, numeric, text, integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
