-- =============================================================================
-- Commerce support lookup and unresolved alert count
-- =============================================================================

CREATE OR REPLACE FUNCTION public.commerce_get_operations_alert_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_staff_permission('commerce-operations', 'view') THEN
    RAISE EXCEPTION 'Commerce operations view permission required.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.commerce_operations_alerts
  WHERE status IN ('open','acknowledged');

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_get_operations_alert_detail(p_alert_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alert public.commerce_operations_alerts%ROWTYPE;
  v_attempt public.commerce_payment_attempts%ROWTYPE;
  v_order public.commerce_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_staff_permission('commerce-operations', 'view') THEN
    RAISE EXCEPTION 'Commerce operations view permission required.' USING ERRCODE = '42501';
  END IF;
  IF p_alert_id IS NULL THEN
    RAISE EXCEPTION 'Operations alert id is required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_alert
  FROM public.commerce_operations_alerts a
  WHERE a.id = p_alert_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operations alert not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_alert.payment_attempt_id IS NOT NULL THEN
    SELECT * INTO v_attempt
    FROM public.commerce_payment_attempts a
    WHERE a.id = v_alert.payment_attempt_id;

    IF FOUND THEN
      SELECT * INTO v_order
      FROM public.commerce_orders o
      WHERE o.id = v_attempt.order_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'alert', jsonb_build_object(
      'id', v_alert.id,
      'outbox_id', v_alert.outbox_id,
      'payment_attempt_id', v_alert.payment_attempt_id,
      'severity', v_alert.severity,
      'code', v_alert.code,
      'status', v_alert.status,
      'acknowledged_at', v_alert.acknowledged_at,
      'resolved_at', v_alert.resolved_at,
      'created_at', v_alert.created_at,
      'updated_at', v_alert.updated_at
    ),
    'paymentAttempt', CASE WHEN v_attempt.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_attempt.id,
      'order_id', v_attempt.order_id,
      'provider', v_attempt.provider,
      'provider_payment_id', v_attempt.provider_payment_id,
      'status', v_attempt.status,
      'amount_minor', v_attempt.amount_minor,
      'currency', v_attempt.currency,
      'expires_at', v_attempt.expires_at,
      'succeeded_at', v_attempt.succeeded_at,
      'failed_at', v_attempt.failed_at,
      'created_at', v_attempt.created_at,
      'updated_at', v_attempt.updated_at
    ) END,
    'order', CASE WHEN v_order.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_order.id,
      'order_number', v_order.order_number,
      'owner_user_id', v_order.owner_user_id,
      'status', v_order.status,
      'currency', v_order.currency,
      'subtotal_minor', v_order.subtotal_minor,
      'tax_minor', v_order.tax_minor,
      'total_minor', v_order.total_minor,
      'terms_version', v_order.terms_version,
      'package_snapshot', v_order.package_snapshot,
      'paid_at', v_order.paid_at,
      'cancelled_at', v_order.cancelled_at,
      'created_at', v_order.created_at,
      'updated_at', v_order.updated_at
    ) END,
    'paymentEvents', (
      SELECT COALESCE(jsonb_agg(to_jsonb(support_event) ORDER BY support_event.received_at), '[]'::jsonb)
      FROM (
        SELECT
          e.id,
          e.provider,
          e.provider_event_id,
          e.provider_payment_id,
          e.payment_attempt_id,
          e.order_id,
          e.event_type,
          e.verification_method,
          e.amount_minor,
          e.currency,
          e.occurred_at,
          e.received_at
        FROM public.commerce_payment_events e
        WHERE (v_attempt.id IS NOT NULL AND e.payment_attempt_id = v_attempt.id)
           OR (v_order.id IS NOT NULL AND e.order_id = v_order.id)
        ORDER BY e.received_at
        LIMIT 100
      ) support_event
    ),
    'entitlements', (
      SELECT COALESCE(jsonb_agg(to_jsonb(support_entitlement) ORDER BY support_entitlement.created_at), '[]'::jsonb)
      FROM (
        SELECT
          e.id,
          e.order_item_id,
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
          e.updated_at
        FROM public.commerce_entitlements e
        JOIN public.commerce_order_items oi ON oi.id = e.order_item_id
        WHERE v_order.id IS NOT NULL
          AND oi.order_id = v_order.id
        ORDER BY e.created_at
      ) support_entitlement
    ),
    'quotaReservations', (
      SELECT COALESCE(jsonb_agg(to_jsonb(support_reservation) ORDER BY support_reservation.created_at), '[]'::jsonb)
      FROM (
        SELECT
          r.id,
          r.entitlement_id,
          r.owner_user_id,
          r.user_listing_id,
          r.quantity,
          r.status,
          r.submission_cycle,
          r.expires_at,
          r.consumed_at,
          r.released_at,
          r.created_at,
          r.updated_at
        FROM public.commerce_quota_reservations r
        JOIN public.commerce_entitlements e ON e.id = r.entitlement_id
        JOIN public.commerce_order_items oi ON oi.id = e.order_item_id
        WHERE v_order.id IS NOT NULL
          AND oi.order_id = v_order.id
        ORDER BY r.created_at
      ) support_reservation
    ),
    'listings', (
      SELECT COALESCE(jsonb_agg(to_jsonb(support_listing) ORDER BY support_listing.id), '[]'::jsonb)
      FROM (
        SELECT DISTINCT l.id, l.user_id, l.property_id, l.status
        FROM public.user_listings l
        WHERE l.id IN (
          SELECT e.user_listing_id
          FROM public.commerce_entitlements e
          JOIN public.commerce_order_items oi ON oi.id = e.order_item_id
          WHERE v_order.id IS NOT NULL
            AND oi.order_id = v_order.id
            AND e.user_listing_id IS NOT NULL
          UNION
          SELECT r.user_listing_id
          FROM public.commerce_quota_reservations r
          JOIN public.commerce_entitlements e ON e.id = r.entitlement_id
          JOIN public.commerce_order_items oi ON oi.id = e.order_item_id
          WHERE v_order.id IS NOT NULL
            AND oi.order_id = v_order.id
            AND r.user_listing_id IS NOT NULL
        )
      ) support_listing
    ),
    'properties', (
      SELECT COALESCE(jsonb_agg(to_jsonb(support_property) ORDER BY support_property.id), '[]'::jsonb)
      FROM (
        SELECT DISTINCT p.id, p.is_active
        FROM public.properties p
        WHERE p.id IN (
          SELECT e.property_id
          FROM public.commerce_entitlements e
          JOIN public.commerce_order_items oi ON oi.id = e.order_item_id
          WHERE v_order.id IS NOT NULL
            AND oi.order_id = v_order.id
            AND e.property_id IS NOT NULL
          UNION
          SELECT l.property_id
          FROM public.user_listings l
          WHERE l.id IN (
            SELECT e.user_listing_id
            FROM public.commerce_entitlements e
            JOIN public.commerce_order_items oi ON oi.id = e.order_item_id
            WHERE v_order.id IS NOT NULL
              AND oi.order_id = v_order.id
              AND e.user_listing_id IS NOT NULL
          ) AND l.property_id IS NOT NULL
          UNION
          SELECT l.property_id
          FROM public.user_listings l
          WHERE l.id IN (
            SELECT r.user_listing_id
            FROM public.commerce_quota_reservations r
            JOIN public.commerce_entitlements e ON e.id = r.entitlement_id
            JOIN public.commerce_order_items oi ON oi.id = e.order_item_id
            WHERE v_order.id IS NOT NULL
              AND oi.order_id = v_order.id
              AND r.user_listing_id IS NOT NULL
          ) AND l.property_id IS NOT NULL
        )
      ) support_property
    ),
    'notifications', (
      SELECT COALESCE(jsonb_agg(to_jsonb(support_notification) ORDER BY support_notification.created_at), '[]'::jsonb)
      FROM (
        SELECT n.id, n.kind, n.title, n.body, n.action_path, n.read_at, n.created_at
        FROM public.commerce_notifications n
        JOIN public.commerce_outbox o ON o.id = n.outbox_id
        WHERE (v_order.id IS NOT NULL AND o.aggregate_type = 'order' AND o.aggregate_id = v_order.id)
           OR (v_attempt.id IS NOT NULL AND o.aggregate_type = 'payment_attempt' AND o.aggregate_id = v_attempt.id)
        ORDER BY n.created_at
      ) support_notification
    ),
    'auditTimeline', (
      SELECT COALESCE(jsonb_agg(to_jsonb(support_audit) ORDER BY support_audit.occurred_at), '[]'::jsonb)
      FROM (
        SELECT a.id, a.actor_role, a.entity_type, a.entity_id, a.event_type, a.correlation_id, a.occurred_at
        FROM public.commerce_audit_events a
        WHERE a.entity_id IN (v_alert.id, v_attempt.id, v_order.id)
        ORDER BY a.occurred_at
        LIMIT 200
      ) support_audit
    ),
    'generatedAt', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_get_operations_alert_count() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_get_operations_alert_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commerce_get_operations_alert_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_get_operations_alert_detail(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
