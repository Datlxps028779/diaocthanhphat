-- =============================================================================
-- Public Product eligibility boundary
--
-- Keep admin/staff policies unchanged, but make the anon/authenticated public
-- read policy agree with Search Visibility's canonical Product gate. This
-- prevents active rows with malformed/missing public URL components from
-- leaking through direct PostgREST reads or the SECURITY INVOKER search RPC.
-- It does not change admin write permissions or mutate existing data.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "public_select_properties" ON public.properties;
CREATE POLICY "public_select_properties" ON public.properties
  FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    AND public_code IS NOT NULL
    AND public_code > 0
    AND btrim(coalesce(slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    AND listing_type::text IN ('mua_ban', 'cho_thue')
    AND EXISTS (
      SELECT 1
      FROM public.areas AS area
      WHERE area.id = properties.area_id
        AND btrim(coalesce(area.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
