-- =============================================================================
-- Commerce email delivery queue and SMTP worker boundary
-- =============================================================================

ALTER TABLE public.commerce_operations_alerts
  DROP CONSTRAINT IF EXISTS commerce_operations_alerts_code_check;
ALTER TABLE public.commerce_operations_alerts
  ADD CONSTRAINT commerce_operations_alerts_code_check CHECK (
    code IN ('payment_failure_ignored','duplicate_settlement','email_delivery_dead_letter')
  );

CREATE TABLE IF NOT EXISTS public.commerce_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL UNIQUE REFERENCES public.commerce_notifications(id) ON DELETE RESTRICT,
  outbox_id uuid NOT NULL REFERENCES public.commerce_outbox(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  payment_attempt_id uuid REFERENCES public.commerce_payment_attempts(id) ON DELETE SET NULL,
  recipient_email text NOT NULL CHECK (char_length(btrim(recipient_email)) BETWEEN 3 AND 320),
  template_kind text NOT NULL CHECK (template_kind IN ('payment_succeeded','payment_failed')),
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 160),
  body_text text NOT NULL CHECK (char_length(btrim(body_text)) BETWEEN 1 AND 2000),
  action_path text CHECK (
    action_path IS NULL OR (
      char_length(action_path) BETWEEN 2 AND 501
      AND action_path ~ '^/[A-Za-z0-9/_?=&.-]+$'
    )
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','retry','sent','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  processing_token uuid,
  next_attempt_at timestamptz,
  last_error_code text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commerce_email_delivery_work
  ON public.commerce_email_deliveries(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_commerce_email_delivery_owner
  ON public.commerce_email_deliveries(owner_user_id, created_at DESC);

ALTER TABLE public.commerce_email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commerce_email_deliveries FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_commerce_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_payment_attempt_id uuid;
BEGIN
  SELECT NULLIF(btrim(u.email), '') INTO v_email
  FROM auth.users u
  WHERE u.id = NEW.owner_user_id;

  IF NEW.kind = 'payment_succeeded' THEN
    SELECT a.id INTO v_payment_attempt_id
    FROM public.commerce_payment_attempts a
    JOIN public.commerce_orders o ON o.id = a.order_id
    JOIN public.commerce_outbox outbox ON outbox.id = NEW.outbox_id
    WHERE outbox.aggregate_type = 'order'
      AND outbox.aggregate_id = o.id
      AND a.status IN ('succeeded','partially_refunded','refunded','chargeback')
    ORDER BY a.succeeded_at DESC NULLS LAST, a.created_at DESC
    LIMIT 1;
  ELSE
    SELECT a.id INTO v_payment_attempt_id
    FROM public.commerce_payment_attempts a
    JOIN public.commerce_outbox outbox ON outbox.id = NEW.outbox_id
    WHERE outbox.aggregate_type = 'payment_attempt'
      AND outbox.aggregate_id = a.id;
  END IF;

  IF v_email IS NULL THEN
    INSERT INTO public.commerce_operations_alerts(
      outbox_id, payment_attempt_id, severity, code, status, payload
    ) VALUES (
      NEW.outbox_id, v_payment_attempt_id, 'warning', 'email_delivery_dead_letter', 'open',
      jsonb_build_object('reason', 'recipient_email_missing', 'notification_id', NEW.id)
    )
    ON CONFLICT ON CONSTRAINT commerce_operations_alerts_outbox_id_key DO UPDATE
    SET status = 'open', code = 'email_delivery_dead_letter',
        payload = EXCLUDED.payload, updated_at = clock_timestamp();
    RETURN NEW;
  END IF;

  INSERT INTO public.commerce_email_deliveries(
    notification_id, outbox_id, owner_user_id, payment_attempt_id,
    recipient_email, template_kind, subject, body_text, action_path,
    status, next_attempt_at
  ) VALUES (
    NEW.id, NEW.outbox_id, NEW.owner_user_id, v_payment_attempt_id,
    v_email, NEW.kind, NEW.title, NEW.body, NEW.action_path,
    'pending', clock_timestamp()
  ) ON CONFLICT (notification_id) DO NOTHING;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    NEW.owner_user_id, 'system', 'notification', NEW.id,
    'commerce_email_delivery_queued', NEW.outbox_id::text,
    jsonb_build_object('template_kind', NEW.kind, 'payment_attempt_id', v_payment_attempt_id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_commerce_notification_email ON public.commerce_notifications;
CREATE TRIGGER trg_enqueue_commerce_notification_email
  AFTER INSERT ON public.commerce_notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_commerce_notification_email();

CREATE OR REPLACE FUNCTION public.commerce_claim_email_deliveries(p_limit integer DEFAULT 20)
RETURNS TABLE(
  email_delivery_id uuid,
  processing_token uuid,
  recipient_email text,
  template_kind text,
  subject text,
  body_text text,
  action_path text,
  attempt_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Invalid email delivery claim limit.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT d.id
    FROM public.commerce_email_deliveries d
    WHERE (
      d.status IN ('pending','retry')
      AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= clock_timestamp())
    ) OR (
      d.status = 'processing'
      AND d.next_attempt_at IS NOT NULL
      AND d.next_attempt_at <= clock_timestamp()
    )
    ORDER BY d.created_at, d.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.commerce_email_deliveries d
  SET status = 'processing', attempts = d.attempts + 1,
      processing_token = gen_random_uuid(),
      next_attempt_at = clock_timestamp() + interval '5 minutes',
      last_error_code = NULL,
      updated_at = clock_timestamp()
  FROM candidates c
  WHERE d.id = c.id
  RETURNING d.id, d.processing_token, d.recipient_email, d.template_kind,
            d.subject, d.body_text, d.action_path, d.attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_complete_email_delivery(
  p_email_delivery_id uuid,
  p_processing_token uuid,
  p_provider_message_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery public.commerce_email_deliveries%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_provider_message_id IS NULL OR char_length(btrim(p_provider_message_id)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid provider message id.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_delivery
  FROM public.commerce_email_deliveries d
  WHERE d.id = p_email_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email delivery not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_delivery.status = 'sent' THEN
    RETURN 'sent';
  END IF;
  IF v_delivery.status <> 'processing' OR v_delivery.processing_token IS DISTINCT FROM p_processing_token THEN
    RAISE EXCEPTION 'Email delivery claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.commerce_email_deliveries d
  SET status = 'sent', processing_token = NULL, next_attempt_at = NULL,
      last_error_code = NULL, provider_message_id = btrim(p_provider_message_id),
      sent_at = COALESCE(d.sent_at, clock_timestamp()), updated_at = clock_timestamp()
  WHERE d.id = v_delivery.id;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    v_delivery.owner_user_id, 'system', 'email_delivery', v_delivery.id,
    'commerce_email_delivery_sent', v_delivery.outbox_id::text,
    jsonb_build_object('attempts', v_delivery.attempts, 'template_kind', v_delivery.template_kind)
  );

  RETURN 'sent';
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_fail_email_delivery(
  p_email_delivery_id uuid,
  p_processing_token uuid,
  p_error_code text,
  p_retryable boolean,
  p_provider_message_id text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery public.commerce_email_deliveries%ROWTYPE;
  v_next_status text;
  v_next_attempt_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_error_code IS NULL OR p_error_code !~ '^[A-Za-z0-9_:-]{2,80}$' THEN
    RAISE EXCEPTION 'Invalid email delivery error code.' USING ERRCODE = '22023';
  END IF;
  IF p_provider_message_id IS NOT NULL AND char_length(btrim(p_provider_message_id)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid provider message id.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_delivery
  FROM public.commerce_email_deliveries d
  WHERE d.id = p_email_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email delivery not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_delivery.status = 'sent' THEN
    RETURN 'sent';
  END IF;
  IF v_delivery.status <> 'processing' OR v_delivery.processing_token IS DISTINCT FROM p_processing_token THEN
    RAISE EXCEPTION 'Email delivery claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;

  IF p_provider_message_id IS NULL AND p_retryable AND v_delivery.attempts < 8 THEN
    v_next_status := 'retry';
    v_next_attempt_at := clock_timestamp() + CASE v_delivery.attempts
      WHEN 1 THEN interval '30 seconds'
      WHEN 2 THEN interval '1 minute'
      WHEN 3 THEN interval '2 minutes'
      WHEN 4 THEN interval '5 minutes'
      WHEN 5 THEN interval '15 minutes'
      ELSE interval '30 minutes'
    END;
  ELSE
    v_next_status := 'dead_letter';
    v_next_attempt_at := NULL;
  END IF;

  UPDATE public.commerce_email_deliveries d
  SET status = v_next_status, processing_token = NULL,
      next_attempt_at = v_next_attempt_at, last_error_code = p_error_code,
      provider_message_id = COALESCE(d.provider_message_id, NULLIF(btrim(p_provider_message_id), '')),
      updated_at = clock_timestamp()
  WHERE d.id = v_delivery.id;

  IF v_next_status = 'dead_letter' THEN
    INSERT INTO public.commerce_operations_alerts(
      outbox_id, payment_attempt_id, severity, code, status, payload
    ) VALUES (
      v_delivery.outbox_id, v_delivery.payment_attempt_id, 'warning',
      'email_delivery_dead_letter', 'open',
      jsonb_build_object(
        'email_delivery_id', v_delivery.id,
        'notification_id', v_delivery.notification_id,
        'attempts', v_delivery.attempts,
        'error_code', p_error_code,
        'provider_message_recorded', p_provider_message_id IS NOT NULL
      )
    )
    ON CONFLICT ON CONSTRAINT commerce_operations_alerts_outbox_id_key DO UPDATE
    SET payment_attempt_id = EXCLUDED.payment_attempt_id,
        severity = EXCLUDED.severity,
        code = EXCLUDED.code,
        status = 'open',
        payload = EXCLUDED.payload,
        acknowledged_at = NULL,
        resolved_at = NULL,
        updated_at = clock_timestamp();

    INSERT INTO public.commerce_audit_events(
      owner_user_id, actor_role, entity_type, entity_id,
      event_type, correlation_id, after_state
    ) VALUES (
      v_delivery.owner_user_id, 'system', 'email_delivery', v_delivery.id,
      'commerce_email_delivery_dead_lettered', v_delivery.outbox_id::text,
      jsonb_build_object('attempts', v_delivery.attempts, 'error_code', p_error_code)
    );
  END IF;

  RETURN v_next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_get_operations_alert_email_deliveries(p_alert_id uuid)
RETURNS TABLE(
  id uuid,
  notification_id uuid,
  template_kind text,
  status text,
  attempts integer,
  last_error_code text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_outbox_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_staff_permission('commerce-operations', 'view') THEN
    RAISE EXCEPTION 'Commerce operations view permission required.' USING ERRCODE = '42501';
  END IF;

  SELECT a.outbox_id INTO v_outbox_id
  FROM public.commerce_operations_alerts a
  WHERE a.id = p_alert_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operations alert not found.' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT d.id, d.notification_id, d.template_kind, d.status, d.attempts,
         d.last_error_code, d.provider_message_id, d.sent_at, d.created_at, d.updated_at
  FROM public.commerce_email_deliveries d
  WHERE d.outbox_id = v_outbox_id
  ORDER BY d.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_commerce_notification_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_claim_email_deliveries(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_complete_email_delivery(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_fail_email_delivery(uuid, uuid, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_get_operations_alert_email_deliveries(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.commerce_claim_email_deliveries(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_complete_email_delivery(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_fail_email_delivery(uuid, uuid, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_get_operations_alert_email_deliveries(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
