-- Read-only preflight for product panorama 360 migration.
SELECT
  pp.id,
  pp.property_id,
  pp.storage_path,
  pp.original_filename,
  pp.mime_type,
  pp.size_bytes,
  pp.width,
  pp.height,
  round(pp.width::numeric / NULLIF(pp.height, 0), 4) AS aspect_ratio,
  pp.is_active,
  p.is_active AS property_is_active,
  p.title
FROM public.property_panoramas pp
LEFT JOIN public.properties p ON p.id = pp.property_id
ORDER BY pp.created_at DESC, pp.id DESC;

SELECT count(*) AS panorama_rows_on_existing_schema
FROM public.property_panoramas;

SELECT count(*) AS panorama_rows_with_inactive_property
FROM public.property_panoramas pp
JOIN public.properties p ON p.id = pp.property_id
WHERE pp.is_active = true AND p.is_active = false;

SELECT bucket_id, name, owner, metadata
FROM storage.objects
WHERE bucket_id = 'property-360'
ORDER BY created_at DESC;
