-- Read-only audit for listing title/location mismatches.
-- No UPDATE is performed. Review the returned IDs and approve exact title edits manually.
SELECT
  p.id,
  p.title,
  p.is_active,
  p.city,
  p.district,
  p.ward,
  a.name AS area_name,
  a.slug AS area_slug,
  p.slug AS public_slug,
  p.public_code
FROM public.properties AS p
LEFT JOIN public.areas AS a ON a.id = p.area_id
WHERE p.is_active = true
  AND p.title ILIKE '%Đồng Nai%'
  AND COALESCE(a.name, '') ILIKE '%Bình Phước%'
ORDER BY p.updated_at DESC NULLS LAST;
