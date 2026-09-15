-- =============================================================================
-- Search Visibility: persist quality-gated property_type candidates
--
-- Additive production migration. It only aligns the entity_type CHECK with the
-- application candidate contract. It does not alter rows, URLs, indexes, RLS,
-- freshness, RAG, or Google integrations.
-- Production SQL is run by the user.
-- =============================================================================

BEGIN;

ALTER TABLE public.search_visibility_urls
  DROP CONSTRAINT IF EXISTS search_visibility_urls_entity_type_check;

ALTER TABLE public.search_visibility_urls
  ADD CONSTRAINT search_visibility_urls_entity_type_check CHECK (entity_type IN (
    'static', 'property', 'news', 'area', 'area_listing', 'neighborhood',
    'property_type', 'news_category', 'managed_page'
  ));

NOTIFY pgrst, 'reload schema';

COMMIT;
