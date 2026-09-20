-- Run manually before the migration. Aggregate counts only; no identities/contact fields.
BEGIN TRANSACTION READ ONLY;

WITH public_ids AS (
  SELECT id FROM public.public_properties WHERE is_active = true
), author_counts AS (
  SELECT ul.property_id, count(DISTINCT ul.user_id) AS owner_count
  FROM public.user_listings ul JOIN public_ids pp ON pp.id = ul.property_id
  GROUP BY ul.property_id
), unique_author AS (
  SELECT DISTINCT ul.property_id, ul.user_id
  FROM public.user_listings ul
  JOIN author_counts ac ON ac.property_id = ul.property_id AND ac.owner_count = 1
), classified AS (
  SELECT pp.id, CASE
    WHEN coalesce(ac.owner_count, 0) = 0 THEN 'no_owner_mapping'
    WHEN ac.owner_count > 1 THEN 'conflicting_owners'
    WHEN p.id IS NULL THEN 'missing_account'
    WHEN p.role = 'staff' THEN 'staff_author_not_public_policy'
    WHEN p.role = 'admin' THEN 'admin_author_not_public_policy'
    WHEN p.role IS DISTINCT FROM 'user' THEN 'other_role_not_public_policy'
    WHEN NOT EXISTS (
      SELECT 1 FROM public.user_listings ul
      WHERE ul.property_id = pp.id AND ul.user_id = ua.user_id AND ul.status = 'approved'
    ) THEN 'no_approved_owner_mapping'
    WHEN NOT EXISTS (SELECT 1 FROM public.agent_profiles ap WHERE ap.user_id = ua.user_id)
      THEN 'no_agent_profile'
    WHEN NOT EXISTS (SELECT 1 FROM public.agent_profiles ap WHERE ap.user_id = ua.user_id AND ap.status = 'published')
      THEN 'profile_not_published'
    WHEN NOT EXISTS (SELECT 1 FROM public.agent_profiles ap WHERE ap.user_id = ua.user_id AND ap.status = 'published' AND btrim(ap.display_name) <> '')
      THEN 'blank_public_name'
    ELSE 'attributable'
  END AS category
  FROM public_ids pp
  LEFT JOIN author_counts ac ON ac.property_id = pp.id
  LEFT JOIN unique_author ua ON ua.property_id = pp.id
  LEFT JOIN public.profiles p ON p.id = ua.user_id
)
SELECT category, count(*) AS property_count,
       round(100.0 * count(*) / nullif(sum(count(*)) OVER (), 0), 2) AS percent,
       sum(count(*)) OVER () AS public_property_total
FROM classified GROUP BY category ORDER BY category;

-- Mapping alone does not establish how historical links were created.
SELECT count(*) AS mapped_properties, count(*) FILTER (WHERE listing_count > 1) AS multiple_listing_rows
FROM (
  SELECT ul.property_id, count(*) AS listing_count
  FROM public.user_listings ul
  JOIN public.public_properties pp ON pp.id = ul.property_id AND pp.is_active = true
  GROUP BY ul.property_id
) mapped;
COMMIT;
