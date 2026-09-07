BEGIN;

ALTER TABLE public.property_panoramas
  DROP CONSTRAINT IF EXISTS property_panoramas_path_check;

ALTER TABLE public.property_panoramas
  ADD CONSTRAINT property_panoramas_path_check CHECK (
    storage_path LIKE property_id::text || '/%'
    OR storage_path ~ '^user-listings/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[^/]+[.](jpe?g|webp)$'
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
