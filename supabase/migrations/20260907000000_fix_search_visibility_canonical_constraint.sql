-- Search Visibility canonical-domain constraint repair.
-- Additive, idempotent, and limited to the private audit table.
-- This migration does not alter source data, public routes, sitemap, robots,
-- Google credentials, or any Google API behavior.

BEGIN;

ALTER TABLE public.search_visibility_urls
  DROP CONSTRAINT IF EXISTS search_visibility_url_absolute_canonical;

ALTER TABLE public.search_visibility_urls
  ADD CONSTRAINT search_visibility_url_absolute_canonical CHECK (
    canonical_url IS NULL OR canonical_url ~ '^https://chonhaviet\.com/[A-Za-z0-9/_-]*$'
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
