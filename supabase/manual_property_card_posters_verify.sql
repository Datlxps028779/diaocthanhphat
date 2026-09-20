-- Run manually after migration. No persistent writes; failures raise exceptions.
BEGIN TRANSACTION READ ONLY;

DO $$
DECLARE
  f regprocedure := 'public.public_get_property_card_posters(uuid[])'::regprocedure;
  sample_id uuid;
  result_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef AND p.provolatile = 's'
      AND 'search_path=public, pg_temp' = ANY(p.proconfig)
      AND p.proargnames = ARRAY['p_property_ids','property_id','display_name','avatar_url','profile_slug','attribution_kind']::text[]
      AND p.proallargtypes = ARRAY['uuid[]'::regtype::oid,'uuid'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid]
  ) THEN RAISE EXCEPTION 'Function metadata or output allowlist mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid = f AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  ) THEN RAISE EXCEPTION 'PUBLIC still has EXECUTE'; END IF;
  IF NOT has_function_privilege('anon', f, 'EXECUTE') OR NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN
    RAISE EXCEPTION 'Required public callers lack EXECUTE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.public_get_property_card_posters(NULL::uuid[]))
    OR EXISTS (SELECT 1 FROM public.public_get_property_card_posters(ARRAY[]::uuid[]))
    OR EXISTS (SELECT 1 FROM public.public_get_property_card_posters(ARRAY[NULL]::uuid[])) THEN
    RAISE EXCEPTION 'Null/empty input leaked output';
  END IF;
  SELECT pp.id INTO sample_id FROM public.public_properties pp WHERE pp.is_active = true ORDER BY pp.id LIMIT 1;
  SELECT count(*) INTO result_count FROM public.public_get_property_card_posters(array_fill(sample_id, ARRAY[100]));
  IF result_count > 1 THEN RAISE EXCEPTION 'Duplicate input produced duplicate output'; END IF;
  BEGIN
    PERFORM * FROM public.public_get_property_card_posters(array_fill(sample_id, ARRAY[101]));
    RAISE EXCEPTION 'Oversized raw input was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END;
$$;

-- Compare every stored property (including inactive) with an independent, exact reference.
DO $$
DECLARE
  batch uuid[];
  mismatches bigint;
  checked bigint := 0;
BEGIN
  FOR batch IN
    SELECT array_agg(id ORDER BY id) FROM (
      SELECT id, (row_number() OVER (ORDER BY id) - 1) / 100 AS batch_no FROM public.properties
    ) numbered GROUP BY batch_no ORDER BY batch_no
  LOOP
    WITH expected AS (
      SELECT pp.id AS property_id, btrim(ap.display_name) AS display_name,
             nullif(btrim(ap.avatar_url), '') AS avatar_url, nullif(btrim(ap.slug), '') AS profile_slug,
             'published-profile'::text AS attribution_kind
      FROM public.public_properties pp
      JOIN public.agent_profiles ap ON ap.status = 'published' AND btrim(ap.display_name) <> ''
      JOIN public.profiles p ON p.id = ap.user_id AND p.role = 'user'
      WHERE pp.id = ANY(batch) AND pp.is_active = true
        AND (SELECT count(DISTINCT ul.user_id) FROM public.user_listings ul WHERE ul.property_id = pp.id) = 1
        AND EXISTS (SELECT 1 FROM public.user_listings ul WHERE ul.property_id = pp.id AND ul.user_id = ap.user_id AND ul.status = 'approved')
    ), actual AS (
      SELECT * FROM public.public_get_property_card_posters(batch)
    ), differences AS (
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
      UNION ALL
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
    )
    SELECT count(*) INTO mismatches FROM differences;
    IF mismatches <> 0 THEN RAISE EXCEPTION 'Projection mismatch: % rows', mismatches; END IF;
    checked := checked + cardinality(batch);
  END LOOP;
  RAISE NOTICE 'Projection matched across % property IDs; empty categories are not exercised by this check', checked;
END;
$$;

-- Actual role execution (not merely ACL inspection); SQL editor must allow SET ROLE.
SET LOCAL ROLE anon;
SELECT 'anon' AS caller, count(*) AS posters_in_first_batch
FROM public.public_get_property_card_posters(ARRAY(
  SELECT id FROM public.public_properties WHERE is_active = true ORDER BY id LIMIT 100
));
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT 'authenticated' AS caller, count(*) AS posters_in_first_batch
FROM public.public_get_property_card_posters(ARRAY(
  SELECT id FROM public.public_properties WHERE is_active = true ORDER BY id LIMIT 100
));
RESET ROLE;
COMMIT;
