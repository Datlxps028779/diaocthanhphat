-- P12 verification: chỉ đọc metadata, không mutate production.

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'admin_reorder_nurture_steps';

SELECT
  to_regprocedure('public.admin_reorder_nurture_steps(uuid[])') AS function_signature;

SELECT
  p.oid::regprocedure AS function_signature,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid = to_regprocedure('public.admin_reorder_nurture_steps(uuid[])')::oid;

SELECT
  COUNT(*) AS step_count,
  COUNT(DISTINCT sort_order) AS distinct_sort_orders,
  MIN(sort_order) AS min_sort_order,
  MAX(sort_order) AS max_sort_order
FROM public.nurture_drip_step;
