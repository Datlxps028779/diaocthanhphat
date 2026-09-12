-- =============================================================================
-- Public Product eligibility boundary verification — read-only
--
-- Run after applying 20260912020000_harden_public_property_eligibility.sql.
-- Confirms anon/authenticated public reads use the same canonical Product gate
-- as Search Visibility. It does not modify data, privileges, or policies.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH policy AS (
  SELECT pol.qual
  FROM pg_policies AS pol
  WHERE pol.schemaname = 'public'
    AND pol.tablename = 'properties'
    AND pol.policyname = 'public_select_properties'
    AND 'anon' = ANY (pol.roles)
    AND 'authenticated' = ANY (pol.roles)
  LIMIT 1
), search_rpc AS (
  SELECT p.prosecdef
  FROM pg_proc AS p
  WHERE p.oid = to_regprocedure('public.search_property_matches(text,text,uuid,uuid,text,text,text,numeric,numeric,numeric,numeric,integer,text,text,boolean,boolean,text,integer,integer)')
)
SELECT jsonb_build_object(
  'policy_exists', EXISTS (SELECT 1 FROM policy),
  'policy_definition', coalesce((SELECT qual FROM policy), ''),
  'public_property_policy_contract_ok',
    EXISTS (SELECT 1 FROM policy WHERE qual LIKE '%is_active%')
    AND EXISTS (SELECT 1 FROM policy WHERE qual LIKE '%public_code%')
    AND EXISTS (SELECT 1 FROM policy WHERE qual LIKE '%listing_type%')
    AND EXISTS (SELECT 1 FROM policy WHERE qual LIKE '%mua_ban%')
    AND EXISTS (SELECT 1 FROM policy WHERE qual LIKE '%cho_thue%')
    AND EXISTS (SELECT 1 FROM policy WHERE lower(qual) LIKE '%from areas%' OR lower(qual) LIKE '%from public.areas%')
    AND EXISTS (SELECT 1 FROM policy WHERE qual LIKE '%area.slug%')
    AND EXISTS (SELECT 1 FROM policy WHERE qual LIKE '%[a-z0-9]+%'),
  'search_property_matches_exists', EXISTS (SELECT 1 FROM search_rpc),
  'search_property_matches_security_invoker', (SELECT NOT prosecdef FROM search_rpc),
  'public_property_eligibility_boundary_ok',
    (SELECT EXISTS (SELECT 1 FROM policy)
      AND EXISTS (SELECT 1 FROM policy WHERE qual LIKE '%is_active%')
      AND EXISTS (SELECT 1 FROM policy WHERE qual LIKE '%public_code%')
      AND EXISTS (SELECT 1 FROM policy WHERE qual LIKE '%listing_type%')
      AND EXISTS (SELECT 1 FROM policy WHERE lower(qual) LIKE '%from areas%' OR lower(qual) LIKE '%from public.areas%')
      AND EXISTS (SELECT 1 FROM policy WHERE qual LIKE '%area.slug%'))
    AND (SELECT EXISTS (SELECT 1 FROM search_rpc WHERE prosecdef = false))
) AS public_property_eligibility_verification;

ROLLBACK;
