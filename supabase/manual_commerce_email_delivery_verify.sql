-- Commerce email delivery post-migration verification. READ ONLY.

WITH table_state AS (
  SELECT c.oid, c.relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'commerce_email_deliveries'
), expected_functions(name, signature, authenticated_expected, service_expected) AS (
  VALUES
    ('enqueue_commerce_notification_email', 'public.enqueue_commerce_notification_email()', false, NULL::boolean),
    ('commerce_claim_email_deliveries', 'public.commerce_claim_email_deliveries(integer)', false, true),
    ('commerce_complete_email_delivery', 'public.commerce_complete_email_delivery(uuid,uuid,text)', false, true),
    ('commerce_fail_email_delivery', 'public.commerce_fail_email_delivery(uuid,uuid,text,boolean,text)', false, true),
    ('commerce_get_operations_alert_email_deliveries', 'public.commerce_get_operations_alert_email_deliveries(uuid)', true, NULL::boolean)
), function_state AS (
  SELECT
    expected.name,
    expected.authenticated_expected,
    expected.service_expected,
    p.oid,
    p.prosecdef,
    p.proconfig,
    pg_get_functiondef(p.oid) AS definition,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
  FROM expected_functions expected
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(expected.signature)
), trigger_state AS (
  SELECT t.tgenabled, t.tgtype, p.proname
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE n.nspname = 'public'
    AND c.relname = 'commerce_notifications'
    AND t.tgname = 'trg_enqueue_commerce_notification_email'
    AND NOT t.tgisinternal
), unsafe_grants AS (
  SELECT 1
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'commerce_email_deliveries'
    AND grantee IN ('anon','authenticated')
), code_constraint AS (
  SELECT pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
  WHERE c.conrelid = 'public.commerce_operations_alerts'::regclass
    AND c.conname = 'commerce_operations_alerts_code_check'
), results AS (
  SELECT
    (SELECT count(*) = 1 AND bool_and(relrowsecurity) FROM table_state) AS table_private,
    NOT EXISTS (SELECT 1 FROM unsafe_grants) AS no_client_table_grants,
    (SELECT count(*) FROM function_state WHERE oid IS NOT NULL) = 5
      AND NOT EXISTS (
        SELECT 1 FROM function_state
        WHERE oid IS NULL
           OR NOT prosecdef
           OR NOT ('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
           OR anon_execute
           OR authenticated_execute IS DISTINCT FROM authenticated_expected
           OR (service_expected IS NOT NULL AND service_execute IS DISTINCT FROM service_expected)
      ) AS functions_hardened,
    EXISTS (
      SELECT 1 FROM trigger_state
      WHERE tgenabled = 'O' AND tgtype = 5
        AND proname = 'enqueue_commerce_notification_email'
    ) AS notification_trigger_present,
    EXISTS (
      SELECT 1 FROM code_constraint
      WHERE definition ILIKE '%email_delivery_dead_letter%'
    ) AS operations_alert_code_present,
    EXISTS (
      SELECT 1 FROM function_state
      WHERE name = 'commerce_fail_email_delivery'
        AND definition ILIKE '%p_provider_message_id IS NULL%p_retryable%'
        AND definition ILIKE '%provider_message_id = COALESCE%'
        AND definition ILIKE '%email_delivery_dead_letter%'
    ) AS uncertain_delivery_guard_present
)
SELECT *,
  (SELECT jsonb_agg(jsonb_build_object(
    'name', name,
    'oid', oid,
    'security_definer', prosecdef,
    'proconfig', proconfig,
    'anon_execute', anon_execute,
    'authenticated_execute', authenticated_execute,
    'service_execute', service_execute,
    'authenticated_expected', authenticated_expected,
    'service_expected', service_expected
  ) ORDER BY name) FROM function_state) AS email_function_states,
  table_private
  AND no_client_table_grants
  AND functions_hardened
  AND notification_trigger_present
  AND operations_alert_code_present
  AND uncertain_delivery_guard_present
  AS commerce_email_delivery_verify_pass
FROM results;
