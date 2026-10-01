-- Commerce RPC foundation preflight. READ ONLY.
-- Run after the foundation migration and before commerce RPC migrations.

WITH prerequisites(name, exists) AS (
  VALUES
    ('commerce_packages', to_regclass('public.commerce_packages') IS NOT NULL),
    ('commerce_package_versions', to_regclass('public.commerce_package_versions') IS NOT NULL),
    ('commerce_orders', to_regclass('public.commerce_orders') IS NOT NULL),
    ('commerce_order_items', to_regclass('public.commerce_order_items') IS NOT NULL),
    ('commerce_payment_attempts', to_regclass('public.commerce_payment_attempts') IS NOT NULL),
    ('commerce_payment_events', to_regclass('public.commerce_payment_events') IS NOT NULL),
    ('commerce_webhook_inbox', to_regclass('public.commerce_webhook_inbox') IS NOT NULL),
    ('commerce_subscriptions', to_regclass('public.commerce_subscriptions') IS NOT NULL),
    ('commerce_entitlements', to_regclass('public.commerce_entitlements') IS NOT NULL),
    ('commerce_subscription_periods', to_regclass('public.commerce_subscription_periods') IS NOT NULL),
    ('commerce_quota_reservations', to_regclass('public.commerce_quota_reservations') IS NOT NULL),
    ('commerce_quota_ledger', to_regclass('public.commerce_quota_ledger') IS NOT NULL),
    ('commerce_audit_events', to_regclass('public.commerce_audit_events') IS NOT NULL),
    ('commerce_outbox', to_regclass('public.commerce_outbox') IS NOT NULL),
    ('user_listings', to_regclass('public.user_listings') IS NOT NULL),
    ('properties', to_regclass('public.properties') IS NOT NULL)
), planned_functions(name, signature, already_exists) AS (
  VALUES
    ('commerce_create_order', 'public.commerce_create_order(uuid,integer,text)', to_regprocedure('public.commerce_create_order(uuid,integer,text)') IS NOT NULL),
    ('commerce_reserve_listing_quota', 'public.commerce_reserve_listing_quota(uuid,uuid,integer,text,timestamp with time zone)', to_regprocedure('public.commerce_reserve_listing_quota(uuid,uuid,integer,text,timestamp with time zone)') IS NOT NULL),
    ('commerce_consume_listing_quota', 'public.commerce_consume_listing_quota(uuid,text)', to_regprocedure('public.commerce_consume_listing_quota(uuid,text)') IS NOT NULL),
    ('commerce_release_listing_quota', 'public.commerce_release_listing_quota(uuid,text)', to_regprocedure('public.commerce_release_listing_quota(uuid,text)') IS NOT NULL),
    ('commerce_start_payment_attempt', 'public.commerce_start_payment_attempt(uuid,text,text)', to_regprocedure('public.commerce_start_payment_attempt(uuid,text,text)') IS NOT NULL),
    ('commerce_claim_payment_checkout', 'public.commerce_claim_payment_checkout(uuid,text)', to_regprocedure('public.commerce_claim_payment_checkout(uuid,text)') IS NOT NULL),
    ('commerce_attach_payment_checkout', 'public.commerce_attach_payment_checkout(uuid,text,text,timestamp with time zone)', to_regprocedure('public.commerce_attach_payment_checkout(uuid,text,text,timestamp with time zone)') IS NOT NULL),
    ('commerce_fail_payment_attempt', 'public.commerce_fail_payment_attempt(uuid,text,text)', to_regprocedure('public.commerce_fail_payment_attempt(uuid,text,text)') IS NOT NULL),
    ('commerce_enqueue_verified_payment_webhook', 'public.commerce_enqueue_verified_payment_webhook(text,text,text,text,bigint,text,text,text,jsonb,timestamp with time zone)', to_regprocedure('public.commerce_enqueue_verified_payment_webhook(text,text,text,text,bigint,text,text,text,jsonb,timestamp with time zone)') IS NOT NULL),
    ('commerce_claim_payment_webhooks', 'public.commerce_claim_payment_webhooks(integer)', to_regprocedure('public.commerce_claim_payment_webhooks(integer)') IS NOT NULL),
    ('commerce_process_payment_webhook', 'public.commerce_process_payment_webhook(uuid,uuid)', to_regprocedure('public.commerce_process_payment_webhook(uuid,uuid)') IS NOT NULL),
    ('commerce_fail_payment_webhook', 'public.commerce_fail_payment_webhook(uuid,uuid,text,boolean)', to_regprocedure('public.commerce_fail_payment_webhook(uuid,uuid,text,boolean)') IS NOT NULL),
    ('commerce_claim_payment_reconciliations', 'public.commerce_claim_payment_reconciliations(integer)', to_regprocedure('public.commerce_claim_payment_reconciliations(integer)') IS NOT NULL),
    ('commerce_complete_payment_reconciliation', 'public.commerce_complete_payment_reconciliation(uuid,uuid,text,text,bigint,text,text,timestamp with time zone,timestamp with time zone)', to_regprocedure('public.commerce_complete_payment_reconciliation(uuid,uuid,text,text,bigint,text,text,timestamp with time zone,timestamp with time zone)') IS NOT NULL),
    ('commerce_fail_payment_reconciliation', 'public.commerce_fail_payment_reconciliation(uuid,uuid,text,boolean)', to_regprocedure('public.commerce_fail_payment_reconciliation(uuid,uuid,text,boolean)') IS NOT NULL),
    ('commerce_claim_outbox', 'public.commerce_claim_outbox(integer)', to_regprocedure('public.commerce_claim_outbox(integer)') IS NOT NULL),
    ('commerce_deliver_outbox', 'public.commerce_deliver_outbox(uuid,uuid)', to_regprocedure('public.commerce_deliver_outbox(uuid,uuid)') IS NOT NULL),
    ('commerce_fail_outbox', 'public.commerce_fail_outbox(uuid,uuid,text,boolean)', to_regprocedure('public.commerce_fail_outbox(uuid,uuid,text,boolean)') IS NOT NULL)
)
SELECT jsonb_build_object(
  'all_prerequisites_exist', bool_and(p.exists),
  'missing_prerequisites', COALESCE(jsonb_agg(p.name ORDER BY p.name) FILTER (WHERE NOT p.exists), '[]'::jsonb),
  'planned_function_collisions', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'signature', signature) ORDER BY name) FILTER (WHERE already_exists), '[]'::jsonb)
    FROM planned_functions
  ),
  'approved_listing_integrity', jsonb_build_object(
    'missing_property', (
      SELECT count(*) FROM public.user_listings WHERE status = 'approved' AND property_id IS NULL
    ),
    'dangling_property', (
      SELECT count(*)
      FROM public.user_listings l
      LEFT JOIN public.properties p ON p.id = l.property_id
      WHERE l.status = 'approved' AND l.property_id IS NOT NULL AND p.id IS NULL
    ),
    'inactive_linked_property', (
      SELECT count(*)
      FROM public.user_listings l
      JOIN public.properties p ON p.id = l.property_id
      WHERE l.status = 'approved' AND p.is_active = false
    )
  ),
  'preflight_pass', bool_and(p.exists) AND NOT EXISTS (SELECT 1 FROM planned_functions WHERE already_exists),
  'measured_at', now()
) AS commerce_rpc_preflight
FROM prerequisites p;
