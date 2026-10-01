-- Commerce support lookup post-migration verification. READ ONLY.

WITH expected_functions(name, signature) AS (
  VALUES
    ('commerce_get_operations_alert_count', 'public.commerce_get_operations_alert_count()'),
    ('commerce_get_operations_alert_detail', 'public.commerce_get_operations_alert_detail(uuid)')
), function_state AS (
  SELECT
    expected.name,
    p.oid,
    p.prosecdef,
    p.proconfig,
    pg_get_functiondef(p.oid) AS definition,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM expected_functions expected
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(expected.signature)
), results AS (
  SELECT
    (SELECT count(*) FROM function_state WHERE oid IS NOT NULL) = 2
      AND NOT EXISTS (
        SELECT 1 FROM function_state
        WHERE oid IS NULL
           OR NOT prosecdef
           OR NOT ('search_path=public, pg_temp' = ANY(COALESCE(proconfig, ARRAY[]::text[])))
           OR anon_execute
           OR NOT authenticated_execute
      ) AS functions_hardened,
    EXISTS (
      SELECT 1 FROM function_state
      WHERE name = 'commerce_get_operations_alert_count'
        AND definition ILIKE '%commerce-operations%view%'
        AND definition ILIKE '%status IN (%open%acknowledged%)%'
    ) AS unresolved_count_contract_present,
    EXISTS (
      SELECT 1 FROM function_state
      WHERE name = 'commerce_get_operations_alert_detail'
        AND definition ILIKE '%commerce_payment_attempts%'
        AND definition ILIKE '%commerce_orders%'
        AND definition ILIKE '%commerce_entitlements%'
        AND definition ILIKE '%commerce_quota_reservations%'
        AND definition ILIKE '%user_listings%'
        AND definition ILIKE '%properties%'
        AND definition NOT ILIKE '%provider_metadata%'
        AND definition NOT ILIKE '%payload_hash%'
        AND definition NOT ILIKE '%signed_data_hash%'
        AND definition NOT ILIKE '%provider_lookup_hash%'
    ) AS sanitized_lookup_contract_present
)
SELECT *,
  functions_hardened
  AND unresolved_count_contract_present
  AND sanitized_lookup_contract_present
  AS commerce_support_lookup_verify_pass
FROM results;
