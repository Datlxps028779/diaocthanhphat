-- P12 verification: chỉ đọc metadata và dữ liệu tổng hợp, không mutate production.

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'admin_create_lead';

SELECT
  to_regprocedure(
    'public.admin_create_lead(text,text,text,text,text,text,uuid,uuid[],text)'
  ) AS function_signature;

SELECT
  p.oid::regprocedure AS function_signature,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid = to_regprocedure(
    'public.admin_create_lead(text,text,text,text,text,text,uuid,uuid[],text)'
  )::oid;

SELECT
  COUNT(*) FILTER (WHERE status NOT IN ('won', 'lost')) AS open_leads,
  COUNT(*) FILTER (WHERE status NOT IN ('won', 'lost') AND NOT EXISTS (
    SELECT 1
    FROM public.lead_assignments a
    WHERE a.lead_id = l.id
  )) AS open_unassigned_leads,
  COUNT(*) FILTER (WHERE status NOT IN ('won', 'lost') AND NOT EXISTS (
    SELECT 1
    FROM public.lead_activities a
    WHERE a.lead_id = l.id AND a.kind = 'created'
  )) AS open_leads_without_created_activity
FROM public.leads l;
