-- =============================================================================
-- P1 Location Integrity — PRODUCTION DRY RUN / CONFIRMATION
--
-- READ ONLY. This file never writes data. Run before the P1 migration to review
-- eligibility, then run the coverage sections again after the user has applied
-- the migration. Do not run it through application service-role automation.
-- =============================================================================

-- Counts and district_id coverage by table.
SELECT
  'properties' AS table_name,
  count(*) AS total_rows,
  count(*) FILTER (WHERE district_id IS NULL) AS missing_district_id,
  count(*) FILTER (WHERE area_id IS NOT NULL AND btrim(coalesce(district, '')) <> '') AS rows_with_area_and_district,
  count(*) FILTER (WHERE is_active) AS active_rows,
  count(*) FILTER (WHERE is_active AND district_id IS NULL) AS active_missing_district_id
FROM public.properties
UNION ALL
SELECT
  'user_listings' AS table_name,
  count(*) AS total_rows,
  count(*) FILTER (WHERE district_id IS NULL) AS missing_district_id,
  count(*) FILTER (WHERE area_id IS NOT NULL AND btrim(coalesce(district, '')) <> '') AS rows_with_area_and_district,
  count(*) FILTER (WHERE status = 'approved') AS active_rows,
  count(*) FILTER (WHERE status = 'approved' AND district_id IS NULL) AS active_missing_district_id
FROM public.user_listings;

-- Exact district candidate classification. Before the migration, expected safe
-- updates were 25 properties + 1 user listing (re-measure at execution time).
WITH source_rows AS (
  SELECT 'properties'::text AS table_name, id, area_id, district, district_id FROM public.properties
  UNION ALL
  SELECT 'user_listings'::text, id, area_id, district, district_id FROM public.user_listings
), classified AS (
  SELECT
    s.*,
    count(d.id) AS candidate_count,
    (array_agg(d.id ORDER BY d.id))[1] AS candidate_district_id
  FROM source_rows s
  LEFT JOIN public.districts d ON d.area_id = s.area_id
    AND NULLIF(lower(regexp_replace(public.f_unaccent(btrim(d.name)), '\s+', ' ', 'g')), '') = NULLIF(lower(regexp_replace(public.f_unaccent(btrim(s.district)), '\s+', ' ', 'g')), '')
  WHERE s.area_id IS NOT NULL AND NULLIF(lower(regexp_replace(public.f_unaccent(btrim(s.district)), '\s+', ' ', 'g')), '') IS NOT NULL
  GROUP BY s.table_name, s.id, s.area_id, s.district, s.district_id
)
SELECT
  table_name,
  count(*) FILTER (WHERE candidate_count = 1 AND district_id IS NULL) AS safe_updates,
  count(*) FILTER (WHERE candidate_count = 0) AS missing_candidates,
  count(*) FILTER (WHERE candidate_count > 1) AS ambiguous_candidates,
  count(*) FILTER (WHERE candidate_count = 1 AND district_id IS NOT NULL AND district_id <> candidate_district_id) AS conflicting_existing_ids
FROM classified
GROUP BY table_name
ORDER BY table_name;

-- District-resolution blockers; should return zero rows.
WITH source_rows AS (
  SELECT 'properties'::text AS table_name, id, area_id, district, district_id FROM public.properties
  UNION ALL
  SELECT 'user_listings'::text, id, area_id, district, district_id FROM public.user_listings
), classified AS (
  SELECT s.*, count(d.id) AS candidate_count, (array_agg(d.id ORDER BY d.id))[1] AS candidate_district_id
  FROM source_rows s
  LEFT JOIN public.districts d ON d.area_id = s.area_id
    AND NULLIF(lower(regexp_replace(public.f_unaccent(btrim(d.name)), '\s+', ' ', 'g')), '') = NULLIF(lower(regexp_replace(public.f_unaccent(btrim(s.district)), '\s+', ' ', 'g')), '')
  WHERE s.area_id IS NOT NULL AND NULLIF(lower(regexp_replace(public.f_unaccent(btrim(s.district)), '\s+', ' ', 'g')), '') IS NOT NULL
  GROUP BY s.table_name, s.id, s.area_id, s.district, s.district_id
)
SELECT table_name, id, area_id, district, district_id, candidate_count, candidate_district_id
FROM classified
WHERE candidate_count <> 1
   OR (district_id IS NOT NULL AND district_id <> candidate_district_id)
ORDER BY table_name, id
LIMIT 50;

-- Every remaining migration blocker. This mirrors the migration's fail-closed
-- checks so a zero-result review is meaningful before the user applies it.
WITH source_rows AS (
  SELECT 'properties'::text AS table_name, p.id, p.area_id, p.district_id, p.district, p.ward, p.neighborhood_slug
  FROM public.properties p
  UNION ALL
  SELECT 'user_listings'::text, l.id, l.area_id, l.district_id, l.district, l.ward, l.neighborhood_slug
  FROM public.user_listings l
), resolved AS (
  SELECT
    s.*,
    d.id AS exact_district_id,
    selected_district.name AS selected_district_name,
    selected_district.area_id AS selected_district_area_id,
    COALESCE(s.district_id, d.id) AS effective_district_id,
    n.id AS neighborhood_id,
    n.area_id AS neighborhood_area_id,
    n.district_id AS neighborhood_district_id,
    nw.id AS neighborhood_ward_id,
    nw.district_id AS neighborhood_ward_district_id,
    nw.name AS neighborhood_ward_name
  FROM source_rows s
  LEFT JOIN public.districts d
    ON d.area_id = s.area_id
   AND NULLIF(lower(regexp_replace(public.f_unaccent(btrim(d.name)), '\s+', ' ', 'g')), '') = NULLIF(lower(regexp_replace(public.f_unaccent(btrim(s.district)), '\s+', ' ', 'g')), '')
  LEFT JOIN public.districts selected_district ON selected_district.id = s.district_id
  LEFT JOIN public.neighborhoods n ON n.slug = s.neighborhood_slug
  LEFT JOIN public.wards nw ON nw.id = n.ward_id
), blockers AS (
  SELECT r.table_name, r.id,
    CASE
      WHEN r.district_id IS NOT NULL AND r.selected_district_area_id IS NULL THEN 'missing_selected_district'
      WHEN r.district_id IS NOT NULL AND r.area_id IS NOT NULL AND r.selected_district_area_id <> r.area_id THEN 'district_area_mismatch'
      WHEN r.district_id IS NOT NULL
       AND NULLIF(lower(regexp_replace(public.f_unaccent(btrim(r.district)), '\s+', ' ', 'g')), '') IS NOT NULL
       AND NULLIF(lower(regexp_replace(public.f_unaccent(btrim(r.district)), '\s+', ' ', 'g')), '') <> NULLIF(lower(regexp_replace(public.f_unaccent(btrim(r.selected_district_name)), '\s+', ' ', 'g')), '') THEN 'district_label_mismatch'
      WHEN r.neighborhood_id IS NOT NULL
       AND r.effective_district_id IS NOT NULL
       AND r.area_id IS NOT NULL
       AND COALESCE(r.neighborhood_area_id, (SELECT d.area_id FROM public.districts d WHERE d.id = COALESCE(r.neighborhood_district_id, r.neighborhood_ward_district_id))) IS NOT NULL
       AND COALESCE(r.neighborhood_area_id, (SELECT d.area_id FROM public.districts d WHERE d.id = COALESCE(r.neighborhood_district_id, r.neighborhood_ward_district_id))) <> r.area_id THEN 'neighborhood_area_mismatch'
      WHEN r.neighborhood_id IS NOT NULL
       AND r.effective_district_id IS NOT NULL
       AND COALESCE(r.neighborhood_district_id, r.neighborhood_ward_district_id) IS NOT NULL
       AND COALESCE(r.neighborhood_district_id, r.neighborhood_ward_district_id) <> r.effective_district_id THEN 'neighborhood_district_mismatch'
      WHEN r.neighborhood_id IS NOT NULL
       AND r.effective_district_id IS NOT NULL
       AND NULLIF(lower(regexp_replace(public.f_unaccent(btrim(r.ward)), '\s+', ' ', 'g')), '') IS NOT NULL
       AND r.neighborhood_ward_id IS NOT NULL
       AND NULLIF(lower(regexp_replace(public.f_unaccent(btrim(r.ward)), '\s+', ' ', 'g')), '') <> NULLIF(lower(regexp_replace(public.f_unaccent(btrim(r.neighborhood_ward_name)), '\s+', ' ', 'g')), '') THEN 'neighborhood_ward_mismatch'
      WHEN r.ward IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.wards w WHERE NULLIF(lower(regexp_replace(public.f_unaccent(btrim(w.name)), '\s+', ' ', 'g')), '') = NULLIF(lower(regexp_replace(public.f_unaccent(btrim(r.ward)), '\s+', ' ', 'g')), ''))
       AND r.effective_district_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.wards w WHERE w.district_id = r.effective_district_id AND NULLIF(lower(regexp_replace(public.f_unaccent(btrim(w.name)), '\s+', ' ', 'g')), '') = NULLIF(lower(regexp_replace(public.f_unaccent(btrim(r.ward)), '\s+', ' ', 'g')), '')) THEN 'ward_district_mismatch'
    END AS blocker
  FROM resolved r
)
SELECT table_name, id, blocker
FROM blockers
WHERE blocker IS NOT NULL
ORDER BY table_name, id
LIMIT 50;

-- Post-migration confirmation: exact resolvable pairs must agree with district_id.
WITH source_rows AS (
  SELECT 'properties'::text AS table_name, id, area_id, district, district_id FROM public.properties
  UNION ALL
  SELECT 'user_listings'::text, id, area_id, district, district_id FROM public.user_listings
)
SELECT s.table_name, count(*) AS remaining_mismatches
FROM source_rows s
JOIN public.districts d ON d.area_id = s.area_id
  AND NULLIF(lower(regexp_replace(public.f_unaccent(btrim(d.name)), '\s+', ' ', 'g')), '') = NULLIF(lower(regexp_replace(public.f_unaccent(btrim(s.district)), '\s+', ' ', 'g')), '')
WHERE NULLIF(lower(regexp_replace(public.f_unaccent(btrim(s.district)), '\s+', ' ', 'g')), '') IS NOT NULL
  AND s.district_id IS DISTINCT FROM d.id
GROUP BY s.table_name
ORDER BY s.table_name;

-- Public lifecycle distribution is emitted so reviewers can compare before/after.
-- public_code is intentionally not queried here: it is an unrelated optional
-- column whose historical rollout was manual, so requiring it would make this
-- location-only dry run fail on a clean schema.
SELECT is_active, count(*) AS rows
FROM public.properties
GROUP BY is_active
ORDER BY is_active DESC;
