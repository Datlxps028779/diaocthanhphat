-- =============================================================================
-- Commerce outbox delivery: durable owner notifications and operations alerts
-- Additive only. Production execution is user-run.
-- =============================================================================

ALTER TABLE public.commerce_outbox
  ADD COLUMN IF NOT EXISTS processing_token uuid;

CREATE TABLE IF NOT EXISTS public.commerce_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  outbox_id uuid NOT NULL UNIQUE REFERENCES public.commerce_outbox(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('payment_succeeded','payment_failed')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  action_path text CHECK (
    action_path IS NULL OR (
      char_length(action_path) BETWEEN 2 AND 501
      AND action_path ~ '^/[A-Za-z0-9/_?=&.-]+$'
    )
  ),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (read_at IS NULL OR isfinite(read_at))
);

CREATE INDEX IF NOT EXISTS idx_commerce_notifications_owner_created
  ON public.commerce_notifications(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_operations_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL UNIQUE REFERENCES public.commerce_outbox(id) ON DELETE RESTRICT,
  payment_attempt_id uuid REFERENCES public.commerce_payment_attempts(id) ON DELETE RESTRICT,
  severity text NOT NULL CHECK (severity IN ('warning','critical')),
  code text NOT NULL CHECK (code IN ('payment_failure_ignored','duplicate_settlement')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (acknowledged_at IS NULL OR isfinite(acknowledged_at)),
  CHECK (resolved_at IS NULL OR isfinite(resolved_at))
);

CREATE INDEX IF NOT EXISTS idx_commerce_operations_alerts_status_created
  ON public.commerce_operations_alerts(status, severity, created_at DESC);

ALTER TABLE public.commerce_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_operations_alerts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.commerce_notifications, public.commerce_operations_alerts
FROM PUBLIC, anon, authenticated;

CREATE POLICY commerce_notifications_owner_read ON public.commerce_notifications
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
GRANT SELECT ON public.commerce_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.commerce_claim_outbox(
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  outbox_id uuid,
  processing_token uuid,
  topic text,
  aggregate_type text,
  aggregate_id uuid,
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
    RAISE EXCEPTION 'Invalid outbox claim limit.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT o.id
    FROM public.commerce_outbox o
    WHERE (
      o.status IN ('pending','retry')
      AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= clock_timestamp())
    ) OR (
      o.status = 'processing'
      AND o.next_attempt_at IS NOT NULL
      AND o.next_attempt_at <= clock_timestamp()
    )
    ORDER BY o.created_at, o.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.commerce_outbox o
  SET status = 'processing', attempts = o.attempts + 1,
      processing_token = gen_random_uuid(),
      next_attempt_at = clock_timestamp() + interval '2 minutes',
      last_error_code = NULL
  FROM candidates c
  WHERE o.id = c.id
  RETURNING o.id, o.processing_token, o.topic, o.aggregate_type, o.aggregate_id, o.attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_deliver_outbox(
  p_outbox_id uuid,
  p_processing_token uuid
)
RETURNS TABLE(
  outbox_id uuid,
  outcome text,
  destination_type text,
  destination_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_outbox public.commerce_outbox%ROWTYPE;
  v_owner_user_id uuid;
  v_destination_id uuid;
  v_destination_type text;
  v_payment_attempt_id uuid;
  v_kind text;
  v_title text;
  v_body text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_outbox_id IS NULL OR p_processing_token IS NULL THEN
    RAISE EXCEPTION 'Outbox id and processing token are required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_outbox
  FROM public.commerce_outbox o
  WHERE o.id = p_outbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commerce outbox row not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_outbox.status = 'sent' THEN
    IF v_outbox.topic IN ('commerce.order.paid','commerce.payment.failed') THEN
      SELECT n.id INTO v_destination_id
      FROM public.commerce_notifications n
      WHERE n.outbox_id = v_outbox.id;
      v_destination_type := 'owner_notification';
    ELSE
      SELECT a.id INTO v_destination_id
      FROM public.commerce_operations_alerts a
      WHERE a.outbox_id = v_outbox.id;
      v_destination_type := 'operations_alert';
    END IF;
    RETURN QUERY SELECT v_outbox.id, 'already_sent'::text, v_destination_type, v_destination_id;
    RETURN;
  END IF;
  IF v_outbox.status <> 'processing' OR v_outbox.processing_token IS DISTINCT FROM p_processing_token THEN
    RAISE EXCEPTION 'Outbox claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;

  IF v_outbox.topic = 'commerce.order.paid' AND v_outbox.aggregate_type = 'order' THEN
    SELECT o.owner_user_id INTO v_owner_user_id
    FROM public.commerce_orders o
    WHERE o.id = v_outbox.aggregate_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Outbox order aggregate not found.' USING ERRCODE = '23503';
    END IF;
    v_kind := 'payment_succeeded';
    v_title := 'Thanh toán thành công';
    v_body := 'Đơn hàng đã được thanh toán và quyền lợi đang sẵn sàng trong tài khoản.';
  ELSIF v_outbox.topic = 'commerce.payment.failed' AND v_outbox.aggregate_type = 'payment_attempt' THEN
    SELECT o.owner_user_id, a.id INTO v_owner_user_id, v_payment_attempt_id
    FROM public.commerce_payment_attempts a
    JOIN public.commerce_orders o ON o.id = a.order_id
    WHERE a.id = v_outbox.aggregate_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Outbox payment aggregate not found.' USING ERRCODE = '23503';
    END IF;
    v_kind := 'payment_failed';
    v_title := 'Thanh toán chưa thành công';
    v_body := 'Giao dịch chưa hoàn tất. Bạn có thể kiểm tra đơn hàng và thử thanh toán lại.';
  ELSIF v_outbox.topic IN (
    'commerce.payment.failure_ignored',
    'commerce.payment.duplicate_settlement'
  ) AND v_outbox.aggregate_type = 'payment_attempt' THEN
    SELECT a.id INTO v_payment_attempt_id
    FROM public.commerce_payment_attempts a
    WHERE a.id = v_outbox.aggregate_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Outbox operations aggregate not found.' USING ERRCODE = '23503';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported commerce outbox topic or aggregate.' USING ERRCODE = 'P0001';
  END IF;

  IF v_kind IS NOT NULL THEN
    INSERT INTO public.commerce_notifications(
      owner_user_id, outbox_id, kind, title, body, action_path
    ) VALUES (
      v_owner_user_id, v_outbox.id, v_kind, v_title, v_body, '/tai-khoan'
    )
    ON CONFLICT ON CONSTRAINT commerce_notifications_outbox_id_key DO UPDATE
    SET owner_user_id = EXCLUDED.owner_user_id
    WHERE commerce_notifications.owner_user_id = EXCLUDED.owner_user_id
      AND commerce_notifications.kind = EXCLUDED.kind
    RETURNING id INTO v_destination_id;
    v_destination_type := 'owner_notification';
  ELSE
    INSERT INTO public.commerce_operations_alerts(
      outbox_id, payment_attempt_id, severity, code, payload
    ) VALUES (
      v_outbox.id,
      v_payment_attempt_id,
      CASE WHEN v_outbox.topic = 'commerce.payment.duplicate_settlement' THEN 'critical' ELSE 'warning' END,
      CASE WHEN v_outbox.topic = 'commerce.payment.duplicate_settlement' THEN 'duplicate_settlement' ELSE 'payment_failure_ignored' END,
      v_outbox.payload
    )
    ON CONFLICT ON CONSTRAINT commerce_operations_alerts_outbox_id_key DO UPDATE
    SET payment_attempt_id = EXCLUDED.payment_attempt_id
    WHERE commerce_operations_alerts.payment_attempt_id = EXCLUDED.payment_attempt_id
      AND commerce_operations_alerts.code = EXCLUDED.code
    RETURNING id INTO v_destination_id;
    v_destination_type := 'operations_alert';
  END IF;

  IF v_destination_id IS NULL THEN
    RAISE EXCEPTION 'Outbox destination conflicts with existing delivery.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.commerce_outbox o
  SET status = 'sent', processing_token = NULL, next_attempt_at = NULL,
      last_error_code = NULL, sent_at = COALESCE(o.sent_at, clock_timestamp())
  WHERE o.id = v_outbox.id;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    v_owner_user_id, 'system', 'outbox', v_outbox.id,
    'commerce_outbox_delivered', v_outbox.id::text,
    jsonb_build_object(
      'topic', v_outbox.topic,
      'destination_type', v_destination_type,
      'destination_id', v_destination_id
    )
  );

  RETURN QUERY SELECT v_outbox.id, 'sent'::text, v_destination_type, v_destination_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_fail_outbox(
  p_outbox_id uuid,
  p_processing_token uuid,
  p_error_code text,
  p_retryable boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_outbox public.commerce_outbox%ROWTYPE;
  v_next_status text;
  v_next_attempt_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_outbox_id IS NULL OR p_processing_token IS NULL THEN
    RAISE EXCEPTION 'Outbox id and processing token are required.' USING ERRCODE = '22023';
  END IF;
  IF p_error_code IS NULL OR p_error_code !~ '^[A-Za-z0-9_:-]{2,80}$' THEN
    RAISE EXCEPTION 'Invalid outbox error code.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_outbox
  FROM public.commerce_outbox o
  WHERE o.id = p_outbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commerce outbox row not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_outbox.status = 'sent' THEN
    RETURN 'sent';
  END IF;
  IF v_outbox.status <> 'processing' OR v_outbox.processing_token IS DISTINCT FROM p_processing_token THEN
    RAISE EXCEPTION 'Outbox claim is not owned by this worker.' USING ERRCODE = '42501';
  END IF;

  IF p_retryable AND v_outbox.attempts < 8 THEN
    v_next_status := 'retry';
    v_next_attempt_at := clock_timestamp() + CASE v_outbox.attempts
      WHEN 1 THEN interval '15 seconds'
      WHEN 2 THEN interval '30 seconds'
      WHEN 3 THEN interval '1 minute'
      WHEN 4 THEN interval '2 minutes'
      WHEN 5 THEN interval '5 minutes'
      ELSE interval '15 minutes'
    END;
  ELSE
    v_next_status := 'dead_letter';
    v_next_attempt_at := NULL;
  END IF;

  UPDATE public.commerce_outbox o
  SET status = v_next_status, processing_token = NULL,
      next_attempt_at = v_next_attempt_at, last_error_code = p_error_code
  WHERE o.id = v_outbox.id;

  INSERT INTO public.commerce_audit_events(
    actor_role, entity_type, entity_id, event_type, correlation_id, after_state
  ) VALUES (
    'system', 'outbox', v_outbox.id,
    CASE WHEN v_next_status = 'retry' THEN 'commerce_outbox_retry_scheduled' ELSE 'commerce_outbox_dead_lettered' END,
    v_outbox.id::text,
    jsonb_build_object(
      'topic', v_outbox.topic,
      'status', v_next_status,
      'attempts', v_outbox.attempts,
      'error_code', p_error_code,
      'next_attempt_at', v_next_attempt_at
    )
  );

  RETURN v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_claim_outbox(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_deliver_outbox(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_fail_outbox(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_claim_outbox(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_deliver_outbox(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.commerce_fail_outbox(uuid, uuid, text, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
