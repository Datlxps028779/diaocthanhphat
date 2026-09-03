-- Read-only dry-run for 20260923000000_agent_profiles_default_public.sql.
-- Run in Supabase SQL editor before applying the migration.

SELECT
  COUNT(*) FILTER (WHERE p.role = 'user') AS registered_users,
  COUNT(*) FILTER (WHERE p.role = 'user' AND ap.id IS NULL) AS users_missing_agent_profile,
  COUNT(*) FILTER (WHERE p.role = 'user' AND ap.status = 'draft') AS draft_profiles_to_publish,
  COUNT(*) FILTER (WHERE p.role = 'user' AND ap.status = 'disabled') AS disabled_profiles_preserved,
  COUNT(*) FILTER (
    WHERE p.role = 'user'
      AND ap.id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.agent_profiles existing
        WHERE existing.slug = (
          LEFT(
            COALESCE(
              NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(BTRIM(p.display_name)), '[^a-z0-9]+', '-', 'g')), ''),
              'nguoi-dang-tin'
            ),
            82
          ) || '-' || SUBSTR(MD5(p.id::text), 1, 16)
        )
      )
  ) AS profiles_with_available_deterministic_slug
FROM public.profiles p
LEFT JOIN public.agent_profiles ap ON ap.user_id = p.id;

SELECT
  p.id AS user_id,
  p.display_name,
  p.phone,
  LEFT(
    COALESCE(
      NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(BTRIM(p.display_name)), '[^a-z0-9]+', '-', 'g')), ''),
      'nguoi-dang-tin'
    ),
    82
  ) || '-' || SUBSTR(MD5(p.id::text), 1, 16) AS proposed_slug
FROM public.profiles p
LEFT JOIN public.agent_profiles ap ON ap.user_id = p.id
WHERE p.role = 'user'
  AND ap.id IS NULL
ORDER BY p.created_at ASC, p.id ASC;

SELECT
  COUNT(*) AS approved_active_owned_listings,
  COUNT(*) FILTER (WHERE ap.id IS NOT NULL AND ap.status = 'published') AS listings_with_public_owner,
  COUNT(*) FILTER (WHERE ap.id IS NULL) AS listings_without_provisioned_owner
FROM public.user_listings ul
JOIN public.properties pr ON pr.id = ul.property_id AND pr.is_active = true
LEFT JOIN public.agent_profiles ap ON ap.user_id = ul.user_id
WHERE ul.status = 'approved';

SELECT COUNT(*) AS legacy_active_properties_without_explicit_owner
FROM public.properties pr
WHERE pr.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_listings ul
    WHERE ul.property_id = pr.id
      AND ul.status = 'approved'
  );
