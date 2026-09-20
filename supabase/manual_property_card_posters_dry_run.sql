-- Run manually before the migration. Only the five proposed public output fields.
-- First 100 active public IDs; substitute a reviewed uuid[] in requested to inspect another batch.
BEGIN TRANSACTION READ ONLY;
WITH requested AS (
  SELECT id FROM public.public_properties WHERE is_active = true ORDER BY id LIMIT 100
), author_counts AS (
  SELECT ul.property_id, count(DISTINCT ul.user_id) AS owner_count
  FROM public.user_listings ul JOIN requested r ON r.id = ul.property_id
  GROUP BY ul.property_id
), unique_author AS (
  SELECT DISTINCT ul.property_id, ul.user_id
  FROM public.user_listings ul
  JOIN author_counts ac ON ac.property_id = ul.property_id AND ac.owner_count = 1
)
SELECT pp.id AS property_id, btrim(ap.display_name) AS display_name,
       nullif(btrim(ap.avatar_url), '') AS avatar_url, nullif(btrim(ap.slug), '') AS profile_slug,
       'published-profile'::text AS attribution_kind
FROM requested r
JOIN public.public_properties pp ON pp.id = r.id AND pp.is_active = true
JOIN unique_author ua ON ua.property_id = pp.id
JOIN public.profiles p ON p.id = ua.user_id AND p.role = 'user'
JOIN public.agent_profiles ap ON ap.user_id = ua.user_id AND ap.status = 'published'
WHERE btrim(ap.display_name) <> ''
  AND EXISTS (
    SELECT 1 FROM public.user_listings ul
    WHERE ul.property_id = pp.id AND ul.user_id = ua.user_id AND ul.status = 'approved'
  )
ORDER BY pp.id;
COMMIT;
