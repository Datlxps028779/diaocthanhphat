-- Repair the queue path constraint to allow the dot in valid XML paths such as
-- /sitemap.xml and /sitemap-images.xml. This migration is safe for existing rows.

BEGIN;

ALTER TABLE public.seo_freshness_jobs
  DROP CONSTRAINT IF EXISTS seo_freshness_jobs_path_check;

ALTER TABLE public.seo_freshness_jobs
  ADD CONSTRAINT seo_freshness_jobs_path_check CHECK (
    path ~ '^/[A-Za-z0-9._/-]*$'
    AND path !~ '//'
    AND path !~ '[?#]'
  );

COMMIT;
