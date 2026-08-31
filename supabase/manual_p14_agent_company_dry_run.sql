-- P14 Agent/company foundation: read-only data inventory.
-- Run the whole script in Supabase SQL Editor. It returns one JSON row and never mutates data.

WITH
role_distribution AS (
  SELECT
    COALESCE(role, '(null)') AS role,
    COUNT(*) AS profile_count,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(display_name), '') IS NOT NULL) AS named_profiles,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(phone), '') IS NOT NULL) AS profiles_with_phone,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(avatar_url), '') IS NOT NULL) AS profiles_with_avatar
  FROM public.profiles
  GROUP BY role
),
orphan_profiles AS (
  SELECT COUNT(*) AS orphan_profile_count
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE u.id IS NULL
),
user_listing_lifecycle AS (
  SELECT
    status,
    COUNT(*) AS listing_count,
    COUNT(*) FILTER (WHERE user_id IS NULL) AS without_owner,
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS distinct_owners,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(contact_name), '') IS NOT NULL) AS with_contact_name,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(contact_phone), '') IS NOT NULL) AS with_contact_phone,
    COUNT(*) FILTER (WHERE property_id IS NOT NULL) AS linked_properties
  FROM public.user_listings
  GROUP BY status
),
user_listing_profile_coverage AS (
  SELECT
    COUNT(*) AS total_user_listings,
    COUNT(*) FILTER (WHERE p.id IS NOT NULL) AS listings_with_profile,
    COUNT(*) FILTER (WHERE p.id IS NULL) AS listings_without_profile,
    COUNT(DISTINCT ul.user_id) FILTER (WHERE ul.user_id IS NOT NULL AND p.id IS NOT NULL) AS owners_with_profile,
    COUNT(DISTINCT ul.user_id) FILTER (WHERE ul.user_id IS NOT NULL AND p.id IS NULL) AS owners_without_profile
  FROM public.user_listings ul
  LEFT JOIN public.profiles p ON p.id = ul.user_id
),
approved_links AS (
  SELECT
    COUNT(*) FILTER (WHERE ul.status = 'approved' AND ul.property_id IS NOT NULL) AS approved_linked_listings,
    COUNT(*) FILTER (WHERE ul.status = 'approved' AND ul.property_id IS NULL) AS approved_without_property,
    COUNT(*) FILTER (WHERE ul.property_id IS NOT NULL AND p.id IS NULL) AS linked_listing_without_profile,
    COUNT(*) FILTER (WHERE ul.property_id IS NOT NULL AND ul.user_id IS NULL) AS linked_listing_without_owner
  FROM public.user_listings ul
  LEFT JOIN public.profiles p ON p.id = ul.user_id
),
property_linkage AS (
  SELECT
    (SELECT COUNT(*) FROM public.properties) AS property_rows,
    COUNT(DISTINCT ul.property_id) FILTER (WHERE ul.property_id IS NOT NULL) AS distinct_linked_properties,
    COUNT(*) FILTER (WHERE ul.property_id IS NOT NULL AND pr.id IS NULL) AS dangling_property_links,
    COUNT(*) FILTER (WHERE ul.property_id IS NOT NULL AND pr.id IS NOT NULL) AS valid_property_links,
    (SELECT COUNT(*) FROM public.user_listings WHERE property_id IS NOT NULL) AS linked_property_references,
    (SELECT COUNT(DISTINCT property_id) FROM public.user_listings WHERE property_id IS NOT NULL) AS linked_property_ids,
    (SELECT COUNT(*) FROM public.user_listings WHERE property_id IS NOT NULL)
      - (SELECT COUNT(DISTINCT property_id) FROM public.user_listings WHERE property_id IS NOT NULL) AS duplicate_reference_count
  FROM public.user_listings ul
  LEFT JOIN public.properties pr ON pr.id = ul.property_id
),
property_contact AS (
  SELECT
    COUNT(*) AS property_rows,
    COUNT(*) FILTER (WHERE is_active) AS active_properties,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(contact_name), '') IS NOT NULL) AS with_contact_name,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(contact_phone), '') IS NOT NULL) AS with_contact_phone,
    COUNT(*) FILTER (WHERE is_active AND NULLIF(BTRIM(contact_name), '') IS NOT NULL) AS active_with_contact_name,
    COUNT(*) FILTER (WHERE is_active AND NULLIF(BTRIM(contact_phone), '') IS NOT NULL) AS active_with_contact_phone
  FROM public.properties
),
contact_match_counts AS (
  SELECT
    pr.id,
    COUNT(p.id) AS matching_profile_count
  FROM public.properties pr
  LEFT JOIN public.profiles p
    ON NULLIF(BTRIM(p.display_name), '') = NULLIF(BTRIM(pr.contact_name), '')
   AND NULLIF(BTRIM(p.phone), '') = NULLIF(BTRIM(pr.contact_phone), '')
  WHERE NULLIF(BTRIM(pr.contact_name), '') IS NOT NULL
    AND NULLIF(BTRIM(pr.contact_phone), '') IS NOT NULL
  GROUP BY pr.id
),
property_contact_matches AS (
  SELECT
    COUNT(*) AS properties_with_both_contact_fields,
    COUNT(*) FILTER (WHERE matching_profile_count = 1) AS properties_with_unique_profile_match,
    COUNT(*) FILTER (WHERE matching_profile_count > 1) AS properties_with_ambiguous_profile_match,
    COUNT(*) FILTER (WHERE matching_profile_count = 0) AS properties_without_profile_match
  FROM contact_match_counts
),
project_developer AS (
  SELECT
    COUNT(*) AS project_count,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(developer), '') IS NOT NULL) AS projects_with_developer_text,
    COUNT(DISTINCT LOWER(BTRIM(developer))) FILTER (WHERE NULLIF(BTRIM(developer), '') IS NOT NULL) AS distinct_developer_labels
  FROM public.projects
),
schema_inventory AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.table_name, c.ordinal_position), '[]'::jsonb) AS columns
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name IN ('profiles', 'user_listings', 'properties', 'projects')
    AND c.column_name IN (
      'id', 'user_id', 'role', 'display_name', 'phone', 'avatar_url',
      'status', 'property_id', 'user_listing_id', 'contact_name', 'contact_phone',
      'developer', 'is_active', 'created_at', 'updated_at'
    )
)
SELECT jsonb_build_object(
  'roles', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.role) FROM role_distribution r), '[]'::jsonb),
  'orphan_profiles', (SELECT to_jsonb(o) FROM orphan_profiles o),
  'user_listing_lifecycle', COALESCE((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.status) FROM user_listing_lifecycle u), '[]'::jsonb),
  'user_listing_profile_coverage', (SELECT to_jsonb(u) FROM user_listing_profile_coverage u),
  'approved_links', (SELECT to_jsonb(a) FROM approved_links a),
  'property_linkage', (SELECT to_jsonb(p) FROM property_linkage p),
  'property_contact', (SELECT to_jsonb(p) FROM property_contact p),
  'property_contact_matches', (SELECT to_jsonb(p) FROM property_contact_matches p),
  'project_developer', (SELECT to_jsonb(p) FROM project_developer p),
  'schema_inventory', (SELECT columns FROM schema_inventory)
) AS p14_inventory;
