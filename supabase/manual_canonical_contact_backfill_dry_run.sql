-- Read-only dry-run for canonical listing/property contact backfill.
-- This file never updates, inserts, deletes, reactivates, or changes ownership.
-- It intentionally excludes incomplete profiles, listings without a property,
-- inactive linked properties, and properties without a linked user listing.

BEGIN TRANSACTION READ ONLY;

WITH profile_rows AS (
  SELECT
    id,
    display_name,
    phone,
    NULLIF(regexp_replace(phone, '[^0-9]', '', 'g'), '') AS digits
  FROM public.profiles
), canonical_profiles AS (
  SELECT
    id,
    NULLIF(btrim(display_name), '') AS canonical_name,
    CASE
      WHEN left(digits, 2) = '84' AND length(digits) >= 11
        THEN '0' || substr(digits, 3)
      ELSE digits
    END AS canonical_phone
  FROM profile_rows
), listing_scope AS (
  SELECT
    l.id AS listing_id,
    l.user_id,
    l.status,
    l.property_id,
    l.contact_name AS current_listing_contact_name,
    l.contact_phone AS current_listing_contact_phone,
    l.contact_zalo AS current_listing_contact_zalo,
    cp.canonical_name,
    cp.canonical_phone,
    p.id AS linked_property_id,
    p.is_active AS linked_property_is_active,
    CASE
      WHEN l.property_id IS NULL THEN 'blocked_without_property'
      WHEN cp.id IS NULL THEN 'blocked_missing_profile'
      WHEN cp.canonical_name IS NULL
        OR cp.canonical_phone IS NULL
        OR cp.canonical_phone !~ '^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$'
        THEN 'blocked_incomplete_profile'
      WHEN l.status <> 'approved' THEN 'excluded_not_approved'
      WHEN l.contact_name IS NOT DISTINCT FROM cp.canonical_name
       AND l.contact_phone IS NOT DISTINCT FROM cp.canonical_phone
       AND l.contact_zalo IS NOT DISTINCT FROM cp.canonical_phone
        THEN 'already_canonical'
      ELSE 'candidate_listing_contact'
    END AS classification
  FROM public.user_listings l
  LEFT JOIN canonical_profiles cp
    ON cp.id = l.user_id
  LEFT JOIN public.properties p
    ON p.id = l.property_id
), property_scope AS (
  SELECT
    p.id AS property_id,
    p.is_active,
    l.id AS linked_listing_id,
    l.status AS linked_listing_status,
    l.user_id,
    p.contact_name AS current_property_contact_name,
    p.contact_phone AS current_property_contact_phone,
    p.contact_zalo AS current_property_contact_zalo,
    cp.canonical_name,
    cp.canonical_phone,
    CASE
      WHEN l.id IS NULL THEN 'blocked_unlinked_property'
      WHEN cp.id IS NULL THEN 'blocked_missing_profile'
      WHEN cp.canonical_name IS NULL
        OR cp.canonical_phone IS NULL
        OR cp.canonical_phone !~ '^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$'
        THEN 'blocked_incomplete_profile'
      WHEN l.status <> 'approved' THEN 'excluded_not_approved'
      WHEN p.is_active IS NOT TRUE THEN 'blocked_inactive_property'
      WHEN p.contact_name IS NOT DISTINCT FROM cp.canonical_name
       AND p.contact_phone IS NOT DISTINCT FROM cp.canonical_phone
       AND p.contact_zalo IS NOT DISTINCT FROM cp.canonical_phone
        THEN 'already_canonical'
      ELSE 'candidate_active_property_contact'
    END AS classification
  FROM public.properties p
  LEFT JOIN public.user_listings l
    ON l.property_id = p.id
  LEFT JOIN canonical_profiles cp
    ON cp.id = l.user_id
), listing_summary AS (
  SELECT jsonb_build_object(
    'approved_total', count(*) FILTER (WHERE status = 'approved'),
    'approved_without_property', count(*) FILTER (
      WHERE status = 'approved' AND classification = 'blocked_without_property'
    ),
    'approved_with_valid_owner_and_property', count(*) FILTER (
      WHERE status = 'approved'
        AND classification IN ('candidate_listing_contact', 'already_canonical')
    ),
    'candidate_contact_changes', count(*) FILTER (
      WHERE classification = 'candidate_listing_contact'
    ),
    'already_canonical', count(*) FILTER (
      WHERE classification = 'already_canonical'
    ),
    'blocked_incomplete_profile', count(*) FILTER (
      WHERE classification = 'blocked_incomplete_profile'
    )
  ) AS value
  FROM listing_scope
), property_summary AS (
  SELECT jsonb_build_object(
    'properties_total', count(*),
    'candidate_active_property_changes', count(*) FILTER (
      WHERE classification = 'candidate_active_property_contact'
    ),
    'already_canonical', count(*) FILTER (
      WHERE classification = 'already_canonical'
    ),
    'blocked_inactive_linked_properties', count(*) FILTER (
      WHERE classification = 'blocked_inactive_property'
    ),
    'blocked_unlinked_properties', count(*) FILTER (
      WHERE classification = 'blocked_unlinked_property'
    ),
    'blocked_incomplete_profile', count(*) FILTER (
      WHERE classification = 'blocked_incomplete_profile'
    )
  ) AS value
  FROM property_scope
), listing_changes AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(x) ORDER BY x.listing_id),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      listing_id,
      user_id,
      status,
      property_id,
      current_listing_contact_name,
      current_listing_contact_phone,
      current_listing_contact_zalo,
      canonical_name AS proposed_contact_name,
      canonical_phone AS proposed_contact_phone,
      canonical_phone AS proposed_contact_zalo,
      linked_property_is_active
    FROM listing_scope
    WHERE classification = 'candidate_listing_contact'
  ) x
), property_changes AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(x) ORDER BY x.property_id),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      property_id,
      linked_listing_id,
      linked_listing_status,
      user_id,
      current_property_contact_name,
      current_property_contact_phone,
      current_property_contact_zalo,
      canonical_name AS proposed_contact_name,
      canonical_phone AS proposed_contact_phone,
      canonical_phone AS proposed_contact_zalo
    FROM property_scope
    WHERE classification = 'candidate_active_property_contact'
  ) x
), blocked_rows AS (
  SELECT COALESCE(
    jsonb_agg(to_jsonb(x) ORDER BY x.source, x.id),
    '[]'::jsonb
  ) AS value
  FROM (
    SELECT
      'user_listing' AS source,
      listing_id AS id,
      user_id,
      property_id,
      status,
      classification,
      linked_property_is_active
    FROM listing_scope
    WHERE classification NOT IN ('candidate_listing_contact', 'already_canonical')
    UNION ALL
    SELECT
      'property' AS source,
      property_id AS id,
      user_id,
      linked_listing_id AS property_id,
      linked_listing_status AS status,
      classification,
      is_active AS linked_property_is_active
    FROM property_scope
    WHERE classification NOT IN ('candidate_active_property_contact', 'already_canonical')
  ) x
)
SELECT jsonb_build_object(
  'measured_at', now(),
  'scope', jsonb_build_object(
    'listing_backfill', 'approved listings with a valid owner profile and a linked property',
    'property_backfill', 'active properties linked to an approved listing with a valid owner profile',
    'excluded', jsonb_build_array(
      'incomplete test/admin profiles',
      'approved listings without property',
      'inactive linked properties',
      'unlinked properties',
      'non-approved listings'
    )
  ),
  'listing_summary', (SELECT value FROM listing_summary),
  'property_summary', (SELECT value FROM property_summary),
  'listing_changes', (SELECT value FROM listing_changes),
  'property_changes', (SELECT value FROM property_changes),
  'blocked_or_excluded', (SELECT value FROM blocked_rows),
  'write_performed', false
) AS backfill_preflight;

ROLLBACK;
