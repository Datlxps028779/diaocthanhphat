-- =============================================================================
-- Commerce account and payment operations read models
-- =============================================================================

INSERT INTO public.staff_permission_catalog(module, action, label)
VALUES
  ('commerce-operations', 'view', 'Vận hành thanh toán'),
  ('commerce-operations', 'edit', 'Vận hành thanh toán')
ON CONFLICT (module, action) DO UPDATE SET label = EXCLUDED.label;

CREATE OR REPLACE FUNCTION public.commerce_get_my_account_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'orders', (
      SELECT COALESCE(jsonb_agg(to_jsonb(account_order) ORDER BY account_order.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          o.id,
          o.order_number,
          o.status,
          o.currency,
          o.subtotal_minor,
          o.tax_minor,
          o.total_minor,
          o.terms_version,
          o.package_snapshot,
          (
            SELECT COALESCE(jsonb_agg(to_jsonb(order_item) ORDER BY order_item.created_at), '[]'::jsonb)
            FROM (
              SELECT
                oi.id,
                oi.package_version_id,
                oi.quantity,
                oi.unit_amount_minor,
                oi.total_amount_minor,
                oi.benefit_snapshot,
                oi.created_at
              FROM public.commerce_order_items oi
              WHERE oi.order_id = o.id
              ORDER BY oi.created_at
            ) order_item
          ) AS items,
          o.paid_at,
          o.cancelled_at,
          o.created_at,
          o.updated_at
        FROM public.commerce_orders o
        WHERE o.owner_user_id = v_actor
        ORDER BY o.created_at DESC
        LIMIT 50
      ) account_order
    ),
    'payments', (
      SELECT COALESCE(jsonb_agg(to_jsonb(account_payment) ORDER BY account_payment.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          a.id,
          a.order_id,
          a.provider,
          a.provider_payment_id,
          a.status,
          a.amount_minor,
          a.currency,
          a.checkout_url,
          a.expires_at,
          a.succeeded_at,
          a.failed_at,
          a.created_at,
          a.updated_at
        FROM public.commerce_payment_attempts a
        JOIN public.commerce_orders o ON o.id = a.order_id
        WHERE o.owner_user_id = v_actor
        ORDER BY a.created_at DESC
        LIMIT 100
      ) account_payment
    ),
    'entitlements', (
      SELECT COALESCE(jsonb_agg(to_jsonb(account_entitlement) ORDER BY account_entitlement.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          e.id,
          e.order_item_id,
          e.package_version_id,
          e.subscription_period_id,
          e.user_listing_id,
          e.property_id,
          e.benefit_kind,
          e.status,
          e.quantity_total,
          e.quantity_remaining,
          e.duration_days,
          e.placement_code,
          e.sponsored_label,
          e.starts_at,
          e.ends_at,
          e.activated_at,
          e.created_at,
          e.updated_at,
          (
            e.status = 'active'
            AND (e.starts_at IS NULL OR e.starts_at <= now())
            AND (e.ends_at IS NULL OR e.ends_at > now())
          ) AS is_effective
        FROM public.commerce_entitlements e
        WHERE e.owner_user_id = v_actor
        ORDER BY e.created_at DESC
        LIMIT 100
      ) account_entitlement
    ),
    'quotaLedger', (
      SELECT COALESCE(jsonb_agg(to_jsonb(account_quota) ORDER BY account_quota.occurred_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          q.id,
          q.entitlement_id,
          q.user_listing_id,
          q.order_id,
          q.operation,
          q.delta,
          q.balance_after,
          q.occurred_at
        FROM public.commerce_quota_ledger q
        WHERE q.owner_user_id = v_actor
        ORDER BY q.occurred_at DESC
        LIMIT 100
      ) account_quota
    ),
    'subscriptions', (
      SELECT COALESCE(jsonb_agg(to_jsonb(account_subscription) ORDER BY account_subscription.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          s.id,
          s.package_version_id,
          s.provider,
          s.status,
          s.current_period_start,
          s.current_period_end,
          s.cancel_at_period_end,
          s.cancelled_at,
          s.created_at,
          s.updated_at
        FROM public.commerce_subscriptions s
        WHERE s.owner_user_id = v_actor
        ORDER BY s.created_at DESC
        LIMIT 50
      ) account_subscription
    ),
    'subscriptionPeriods', (
      SELECT COALESCE(jsonb_agg(to_jsonb(account_period) ORDER BY account_period.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          sp.id,
          sp.subscription_id,
          sp.cycle_number,
          sp.order_id,
          sp.status,
          sp.period_start,
          sp.period_end,
          sp.grace_until,
          sp.created_at,
          sp.updated_at
        FROM public.commerce_subscription_periods sp
        JOIN public.commerce_subscriptions s ON s.id = sp.subscription_id
        WHERE s.owner_user_id = v_actor
        ORDER BY sp.created_at DESC
        LIMIT 100
      ) account_period
    ),
    'invoices', (
      SELECT COALESCE(jsonb_agg(to_jsonb(account_invoice) ORDER BY account_invoice.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          i.id,
          i.order_id,
          i.document_type,
          i.status,
          i.invoice_number,
          i.document_url,
          i.issued_at,
          i.voided_at,
          i.created_at,
          i.updated_at
        FROM public.commerce_invoices i
        WHERE i.owner_user_id = v_actor
        ORDER BY i.created_at DESC
        LIMIT 50
      ) account_invoice
    ),
    'refunds', (
      SELECT COALESCE(jsonb_agg(to_jsonb(account_refund) ORDER BY account_refund.requested_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          r.id,
          r.order_id,
          r.payment_attempt_id,
          r.status,
          r.amount_minor,
          r.reason_code,
          r.reason_note,
          r.requested_at,
          r.approved_at,
          r.completed_at,
          r.updated_at
        FROM public.commerce_refunds r
        JOIN public.commerce_orders o ON o.id = r.order_id
        WHERE o.owner_user_id = v_actor
        ORDER BY r.requested_at DESC
        LIMIT 50
      ) account_refund
    ),
    'notifications', (
      SELECT COALESCE(jsonb_agg(to_jsonb(account_notification) ORDER BY account_notification.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT
          n.id,
          n.kind,
          n.title,
          n.body,
          n.action_path,
          n.read_at,
          n.created_at
        FROM public.commerce_notifications n
        WHERE n.owner_user_id = v_actor
        ORDER BY n.created_at DESC
        LIMIT 50
      ) account_notification
    ),
    'unreadNotifications', (
      SELECT count(*)
      FROM public.commerce_notifications n
      WHERE n.owner_user_id = v_actor
        AND n.read_at IS NULL
    ),
    'generatedAt', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_mark_notification_read(p_notification_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_notification_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_notification_id IS NULL THEN
    RAISE EXCEPTION 'Notification id is required.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.commerce_notifications n
  SET read_at = COALESCE(n.read_at, clock_timestamp())
  WHERE n.id = p_notification_id
    AND n.owner_user_id = v_actor
  RETURNING n.id INTO v_notification_id;

  IF v_notification_id IS NULL THEN
    RAISE EXCEPTION 'Notification not found.' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_get_operations_alerts(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  id uuid,
  outbox_id uuid,
  payment_attempt_id uuid,
  severity text,
  code text,
  status text,
  alert_payload jsonb,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_staff_permission('commerce-operations', 'view') THEN
    RAISE EXCEPTION 'Commerce operations view permission required.' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('open','acknowledged','resolved') THEN
    RAISE EXCEPTION 'Invalid operations alert status.' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'Invalid operations alert limit.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.outbox_id,
    a.payment_attempt_id,
    a.severity,
    a.code,
    a.status,
    a.payload,
    a.acknowledged_at,
    a.resolved_at,
    a.created_at,
    a.updated_at
  FROM public.commerce_operations_alerts a
  WHERE p_status IS NULL OR a.status = p_status
  ORDER BY
    CASE a.severity WHEN 'critical' THEN 0 ELSE 1 END,
    a.created_at DESC,
    a.id
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_update_operations_alert_status(
  p_alert_id uuid,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_previous_status text;
  v_alert public.commerce_operations_alerts%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_staff_permission('commerce-operations', 'edit') THEN
    RAISE EXCEPTION 'Commerce operations edit permission required.' USING ERRCODE = '42501';
  END IF;
  IF p_alert_id IS NULL OR p_status NOT IN ('open','acknowledged','resolved') THEN
    RAISE EXCEPTION 'Invalid operations alert update.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_alert
  FROM public.commerce_operations_alerts a
  WHERE a.id = p_alert_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operations alert not found.' USING ERRCODE = 'P0002';
  END IF;

  v_previous_status := v_alert.status;

  UPDATE public.commerce_operations_alerts a
  SET status = p_status,
      acknowledged_at = CASE
        WHEN p_status IN ('acknowledged','resolved') THEN COALESCE(a.acknowledged_at, clock_timestamp())
        ELSE NULL
      END,
      resolved_at = CASE WHEN p_status = 'resolved' THEN COALESCE(a.resolved_at, clock_timestamp()) ELSE NULL END,
      updated_at = clock_timestamp()
  WHERE a.id = v_alert.id
  RETURNING * INTO v_alert;

  v_actor_role := CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_actor AND p.role = 'staff') THEN 'staff'
    ELSE 'admin'
  END;

  INSERT INTO public.commerce_audit_events(
    actor_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, before_state, after_state
  ) VALUES (
    v_actor, v_actor_role, 'operations_alert', v_alert.id,
    'commerce_operations_alert_status_changed', v_alert.id::text,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object('status', p_status)
  );

  RETURN v_alert.id;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_get_my_account_snapshot() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_mark_notification_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_get_operations_alerts(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_update_operations_alert_status(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.commerce_get_my_account_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_get_operations_alerts(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_update_operations_alert_status(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
