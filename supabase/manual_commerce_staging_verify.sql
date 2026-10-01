-- Commerce staging schema-only restore verification. READ ONLY.

WITH expected_tables(name) AS (
  VALUES
    ('commerce_packages'), ('commerce_package_versions'), ('commerce_orders'),
    ('commerce_order_items'), ('commerce_payment_attempts'), ('commerce_payment_events'),
    ('commerce_webhook_inbox'), ('commerce_refunds'), ('commerce_invoices'),
    ('commerce_subscriptions'), ('commerce_subscription_periods'), ('commerce_entitlements'),
    ('commerce_quota_reservations'), ('commerce_quota_ledger'), ('commerce_audit_events'),
    ('commerce_outbox'), ('commerce_payment_reconciliation_jobs'), ('commerce_notifications'),
    ('commerce_operations_alerts'), ('commerce_email_deliveries')
), table_state AS (
  SELECT e.name, c.oid, COALESCE(c.relrowsecurity, false) AS rls_enabled
  FROM expected_tables e
  LEFT JOIN pg_class c ON c.oid = to_regclass(format('public.%I', e.name))
), expected_functions(signature) AS (
  VALUES
    ('public.commerce_create_order(uuid,integer,text)'),
    ('public.commerce_start_payment_attempt(uuid,text,text)'),
    ('public.commerce_enqueue_verified_payment_webhook(text,text,text,text,bigint,text,text,text,jsonb,timestamp with time zone)'),
    ('public.commerce_process_payment_webhook(uuid,uuid)'),
    ('public.commerce_complete_payment_reconciliation(uuid,uuid,text,text,bigint,text,text,timestamp with time zone,timestamp with time zone)'),
    ('public.commerce_deliver_outbox(uuid,uuid)'),
    ('public.commerce_reserve_listing_quota_cycle(uuid,uuid)'),
    ('public.commerce_get_my_account_snapshot()'),
    ('public.commerce_get_operations_alerts(text,integer)'),
    ('public.commerce_get_operations_alert_detail(uuid)'),
    ('public.commerce_claim_email_deliveries(integer)'),
    ('public.commerce_get_catalog()')
), function_state AS (
  SELECT e.signature, p.oid, p.prosecdef, p.proconfig
  FROM expected_functions e
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
), required_triggers(name) AS (
  VALUES
    ('trg_commerce_listing_entitlement_lifecycle'),
    ('trg_commerce_listing_entitlement_delete'),
    ('trg_commerce_payment_reconciliation_job'),
    ('trg_enqueue_commerce_notification_email')
), trigger_state AS (
  SELECT expected.name, t.oid, t.tgenabled
  FROM required_triggers expected
  LEFT JOIN pg_trigger t ON t.tgname = expected.name AND NOT t.tgisinternal
), unsafe_grants AS (
  SELECT 1
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name LIKE 'commerce_%'
    AND grantee IN ('anon','authenticated')
    AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES')
), results AS (
  SELECT
    (SELECT count(*) FROM table_state WHERE oid IS NOT NULL) = 20 AS all_tables_exist,
    (SELECT count(*) = 20 AND bool_and(rls_enabled) FROM table_state WHERE oid IS NOT NULL) AS all_tables_rls,
    (SELECT count(*) FROM function_state WHERE oid IS NOT NULL) = 12
      AND NOT EXISTS (
        SELECT 1 FROM function_state
        WHERE oid IS NULL OR NOT prosecdef
          OR NOT ('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
      ) AS critical_functions_hardened,
    (SELECT count(*) FROM trigger_state WHERE oid IS NOT NULL AND tgenabled = 'O') = 4 AS critical_triggers_enabled,
    NOT EXISTS (SELECT 1 FROM unsafe_grants) AS no_client_write_grants,
    NOT EXISTS (SELECT 1 FROM public.commerce_packages) AS no_package_seed,
    NOT EXISTS (SELECT 1 FROM public.commerce_orders) AS no_order_data,
    NOT EXISTS (SELECT 1 FROM public.commerce_payment_attempts) AS no_payment_attempt_data,
    NOT EXISTS (SELECT 1 FROM public.commerce_payment_events) AS no_payment_event_data,
    NOT EXISTS (SELECT 1 FROM public.commerce_entitlements) AS no_entitlement_data,
    NOT EXISTS (SELECT 1 FROM public.commerce_quota_ledger) AS no_quota_ledger_data,
    NOT EXISTS (SELECT 1 FROM public.commerce_email_deliveries) AS no_email_delivery_data,
    (SELECT count(*) FROM public.staff_permission_catalog) AS staff_permission_catalog_rows,
    (SELECT count(*) FROM public.commerce_get_catalog()) AS catalog_rows
)
SELECT jsonb_build_object(
  'checks', to_jsonb(results),
  'missing_tables', (
    SELECT COALESCE(jsonb_agg(name ORDER BY name) FILTER (WHERE oid IS NULL), '[]'::jsonb)
    FROM table_state
  ),
  'missing_functions', (
    SELECT COALESCE(jsonb_agg(signature ORDER BY signature) FILTER (WHERE oid IS NULL), '[]'::jsonb)
    FROM function_state
  ),
  'staging_verify_pass', (
    results.all_tables_exist
    AND results.all_tables_rls
    AND results.critical_functions_hardened
    AND results.critical_triggers_enabled
    AND results.no_client_write_grants
    AND results.no_package_seed
    AND results.no_order_data
    AND results.no_payment_attempt_data
    AND results.no_payment_event_data
    AND results.no_entitlement_data
    AND results.no_quota_ledger_data
    AND results.no_email_delivery_data
    AND results.catalog_rows = 0
  ),
  'verified_at', now()
) AS commerce_staging_verify
FROM results;
