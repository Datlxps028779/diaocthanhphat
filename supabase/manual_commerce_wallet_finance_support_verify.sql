WITH functions AS (
  SELECT
    p.oid,
    p.proname,
    p.prosecdef,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    COALESCE('search_path=public, pg_temp' = ANY(p.proconfig), false) AS fixed_search_path
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'commerce_finance_adjust_wallet',
      'commerce_finance_open_wallet_chargeback',
      'commerce_finance_resolve_wallet_chargeback',
      'commerce_get_wallet_support_detail'
    )
), checks AS (
  SELECT
    count(*) = 4 AS functions_present,
    bool_and(prosecdef) AS security_definer,
    bool_and(NOT anon_execute) AS anon_denied,
    bool_and(authenticated_execute) AS authenticated_granted,
    bool_and(fixed_search_path) AS fixed_search_path,
    EXISTS (SELECT 1 FROM public.staff_permission_catalog WHERE module = 'commerce-finance' AND action = 'view') AS finance_view_permission,
    EXISTS (SELECT 1 FROM public.staff_permission_catalog WHERE module = 'commerce-finance' AND action = 'edit') AS finance_edit_permission,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'commerce_wallet_finance_cases'
    ) AS finance_cases_table
  FROM functions
)
SELECT *,
  functions_present AND security_definer AND anon_denied AND authenticated_granted
  AND fixed_search_path AND finance_view_permission AND finance_edit_permission AND finance_cases_table
  AS commerce_wallet_finance_support_verify_pass
FROM checks;
