-- =============================================================================
-- Lead Nurture Foundation — last_activity_at cho SLA theo giai đoạn
-- =============================================================================
-- SLA hiện có nhắc lead mới quá 2h + hẹn gọi tay. Cột last_activity_at cho phép
-- phát hiện lead ở các giai đoạn mở đã lâu không có hoạt động (nguội) để nhắc chăm.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zalo_user_id text;

UPDATE leads l
SET last_activity_at = COALESCE(a.max_created_at, l.created_at)
FROM (
  SELECT lead_id, max(created_at) AS max_created_at
  FROM lead_activities
  GROUP BY lead_id
) a
WHERE a.lead_id = l.id
  AND l.last_activity_at IS NULL;

UPDATE leads
SET last_activity_at = created_at
WHERE last_activity_at IS NULL;

CREATE OR REPLACE FUNCTION touch_lead_last_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE leads
  SET last_activity_at = GREATEST(COALESCE(last_activity_at, NEW.created_at), NEW.created_at)
  WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_lead_last_activity ON lead_activities;
CREATE TRIGGER trg_touch_lead_last_activity
AFTER INSERT ON lead_activities
FOR EACH ROW EXECUTE FUNCTION touch_lead_last_activity();

CREATE INDEX IF NOT EXISTS idx_leads_last_activity_at ON leads(last_activity_at);

CREATE TABLE IF NOT EXISTS lead_drip_log (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id  uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  step     text NOT NULL CHECK (step IN ('d1','d3','d7')),
  channel  text NOT NULL DEFAULT 'zalo' CHECK (channel IN ('zalo')),
  status   text NOT NULL CHECK (status IN ('sent','skipped','failed')),
  detail   text,
  sent_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_drip_log_lead_id ON lead_drip_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_drip_log_sent_at ON lead_drip_log(sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_drip_log_sent_once ON lead_drip_log(lead_id, step) WHERE status = 'sent';

ALTER TABLE lead_drip_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ldl_select_admin" ON lead_drip_log;
CREATE POLICY "ldl_select_admin" ON lead_drip_log FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "ldl_insert_admin" ON lead_drip_log;
CREATE POLICY "ldl_insert_admin" ON lead_drip_log FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE TABLE IF NOT EXISTS nurture_drip_config (
  id       boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled  boolean NOT NULL DEFAULT false,
  endpoint text,
  secret   text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nurture_drip_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ndc_select_admin" ON nurture_drip_config;
CREATE POLICY "ndc_select_admin" ON nurture_drip_config FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "ndc_update_admin" ON nurture_drip_config;
CREATE POLICY "ndc_update_admin" ON nurture_drip_config FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "ndc_insert_admin" ON nurture_drip_config;
CREATE POLICY "ndc_insert_admin" ON nurture_drip_config FOR INSERT TO authenticated
  WITH CHECK (is_admin());

INSERT INTO nurture_drip_config (id, enabled, endpoint, secret)
VALUES (true, false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION _invoke_nurture_drip()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg nurture_drip_config%ROWTYPE;
  request_id bigint;
BEGIN
  SELECT * INTO cfg FROM nurture_drip_config WHERE id = true AND enabled = true;
  IF NOT FOUND OR cfg.endpoint IS NULL OR cfg.secret IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN -1;
  END IF;

  EXECUTE 'SELECT net.http_post(url := $1, headers := $2::jsonb, body := $3::jsonb)'
    INTO request_id
    USING cfg.endpoint,
          jsonb_build_object('Content-Type', 'application/json', 'x-drip-secret', cfg.secret),
          '{}'::jsonb;
  RETURN 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION _invoke_nurture_drip() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION admin_invoke_nurture_drip()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN _invoke_nurture_drip();
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_invoke_nurture_drip() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_invoke_nurture_drip() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule('nurture-drip-hourly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nurture-drip-hourly');
    PERFORM cron.schedule('nurture-drip-hourly', '17 * * * *', 'SELECT _invoke_nurture_drip();');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
