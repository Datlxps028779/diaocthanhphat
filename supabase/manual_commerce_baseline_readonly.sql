-- Commerce/P15 baseline measurement. READ ONLY.
-- Run in the production SQL editor by the product owner.
-- This script returns aggregates only; it does not expose names, phones, emails or IDs.

-- 0) Schema/evidence coverage. A false value means the corresponding metric is not
-- safe to interpret as complete historical evidence.
SELECT jsonb_build_object(
  'has_user_listings', to_regclass('public.user_listings') IS NOT NULL,
  'has_properties', to_regclass('public.properties') IS NOT NULL,
  'has_profiles', to_regclass('public.profiles') IS NOT NULL,
  'has_leads', to_regclass('public.leads') IS NOT NULL,
  'has_listing_lifecycle_events', to_regclass('public.user_listing_lifecycle_events') IS NOT NULL,
  'has_phone_reveal_events', to_regclass('public.property_phone_reveal_events') IS NOT NULL,
  'has_auth_users', to_regclass('auth.users') IS NOT NULL,
  'measured_at', now()
) AS commerce_baseline_coverage;

-- 1) Listing status and publication consistency.
SELECT
  l.status,
  count(*) AS listing_count,
  count(DISTINCT l.user_id) AS distinct_owner_count,
  count(*) FILTER (WHERE l.property_id IS NULL) AS without_property,
  count(*) FILTER (WHERE l.property_id IS NOT NULL AND p.id IS NULL) AS dangling_property,
  count(*) FILTER (WHERE l.status = 'approved' AND COALESCE(p.is_active, false)) AS approved_with_active_property,
  count(*) FILTER (WHERE l.status = 'approved' AND NOT COALESCE(p.is_active, false)) AS approved_without_active_property,
  count(*) FILTER (WHERE l.status <> 'approved' AND COALESCE(p.is_active, false)) AS unpublished_with_active_property,
  min(l.created_at) AS first_listing_at,
  max(l.created_at) AS latest_listing_at
FROM public.user_listings l
LEFT JOIN public.properties p ON p.id = l.property_id
GROUP BY l.status
ORDER BY l.status;

-- 2) Owner distribution without exposing owner identity.
WITH owner_counts AS (
  SELECT user_id, count(*) AS listing_count
  FROM public.user_listings
  GROUP BY user_id
)
SELECT
  count(*) AS total_owner_count,
  COALESCE(sum(listing_count), 0) AS total_listing_count,
  count(*) FILTER (WHERE listing_count = 1) AS owners_with_one_listing,
  count(*) FILTER (WHERE listing_count BETWEEN 2 AND 5) AS owners_with_2_to_5_listings,
  count(*) FILTER (WHERE listing_count >= 6) AS owners_with_6_plus_listings,
  COALESCE(max(listing_count), 0) AS max_listings_by_one_owner,
  COALESCE(avg(listing_count), 0)::numeric(12,2) AS average_listings_per_owner
FROM owner_counts;

-- 3) Approval/rejection timing. Lifecycle history may start at the audit migration,
-- so coverage_start/coverage_end must be read before interpreting the percentages.
WITH event_window AS (
  SELECT min(occurred_at) AS coverage_start, max(occurred_at) AS coverage_end
  FROM public.user_listing_lifecycle_events
), submitted AS (
  SELECT listing_id, min(occurred_at) AS submitted_at
  FROM public.user_listing_lifecycle_events
  WHERE event_type IN ('submitted', 'resubmitted', 'renewed')
    AND listing_id IS NOT NULL
  GROUP BY listing_id
), approved AS (
  SELECT listing_id, min(occurred_at) AS approved_at
  FROM public.user_listing_lifecycle_events
  WHERE event_type = 'approved'
    AND listing_id IS NOT NULL
  GROUP BY listing_id
), rejected AS (
  SELECT listing_id, min(occurred_at) AS rejected_at
  FROM public.user_listing_lifecycle_events
  WHERE event_type = 'rejected'
    AND listing_id IS NOT NULL
  GROUP BY listing_id
), durations AS (
  SELECT
    s.listing_id,
    s.submitted_at,
    a.approved_at,
    r.rejected_at,
    CASE WHEN a.approved_at >= s.submitted_at
      THEN extract(epoch FROM a.approved_at - s.submitted_at) / 3600.0 END AS approval_hours
  FROM submitted s
  LEFT JOIN approved a ON a.listing_id = s.listing_id
  LEFT JOIN rejected r ON r.listing_id = s.listing_id
)
SELECT
  (SELECT coverage_start FROM event_window) AS lifecycle_coverage_start,
  (SELECT coverage_end FROM event_window) AS lifecycle_coverage_end,
  count(*) AS submitted_listing_count,
  count(*) FILTER (WHERE approved_at IS NOT NULL) AS submitted_then_approved_count,
  count(*) FILTER (WHERE rejected_at IS NOT NULL) AS submitted_then_rejected_count,
  count(*) FILTER (WHERE approved_at IS NULL AND rejected_at IS NULL) AS submitted_without_terminal_review_count,
  round(avg(approval_hours)::numeric, 2) AS average_approval_hours,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY approval_hours)::numeric, 2) AS median_approval_hours,
  round(percentile_cont(0.9) WITHIN GROUP (ORDER BY approval_hours)::numeric, 2) AS p90_approval_hours
FROM durations;

-- 4) Lifecycle event distribution, including rejection and renewal evidence.
SELECT
  event_type,
  count(*) AS event_count,
  count(DISTINCT listing_id) FILTER (WHERE listing_id IS NOT NULL) AS listing_count,
  min(occurred_at) AS first_event_at,
  max(occurred_at) AS latest_event_at
FROM public.user_listing_lifecycle_events
GROUP BY event_type
ORDER BY event_type;

-- 5) Expiry and renewal horizon.
SELECT
  l.status,
  count(*) AS listing_count,
  count(*) FILTER (WHERE l.expires_at IS NULL) AS without_expiry,
  count(*) FILTER (WHERE l.expires_at <= now()) AS already_expired_or_due,
  count(*) FILTER (WHERE l.expires_at > now() AND l.expires_at <= now() + interval '7 days') AS expires_within_7_days,
  count(*) FILTER (WHERE l.expires_at > now() AND l.expires_at <= now() + interval '30 days') AS expires_within_30_days,
  count(*) FILTER (WHERE l.expires_at > now() AND l.expires_at <= now() + interval '60 days') AS expires_within_60_days
FROM public.user_listings l
GROUP BY l.status
ORDER BY l.status;

SELECT
  count(*) FILTER (WHERE event_type IN ('renewed', 'resubmitted')) AS renewal_or_resubmission_events,
  count(DISTINCT listing_id) FILTER (WHERE event_type IN ('renewed', 'resubmitted')) AS renewed_or_resubmitted_listings,
  min(occurred_at) FILTER (WHERE event_type IN ('renewed', 'resubmitted')) AS first_renewal_event_at,
  max(occurred_at) FILTER (WHERE event_type IN ('renewed', 'resubmitted')) AS latest_renewal_event_at
FROM public.user_listing_lifecycle_events;

-- 6) Views for linked properties. Views are an aggregate counter, not a unique-user metric.
SELECT
  count(*) AS total_property_count,
  count(*) FILTER (WHERE is_active) AS active_property_count,
  COALESCE(sum(views), 0) AS all_property_views,
  COALESCE(sum(views) FILTER (WHERE is_active), 0) AS active_property_views,
  COALESCE(avg(views) FILTER (WHERE is_active), 0)::numeric(14,2) AS average_active_property_views,
  COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY views) FILTER (WHERE is_active), 0)::numeric(14,2) AS median_active_property_views
FROM public.properties;

SELECT
  count(*) AS approved_listing_property_count,
  COALESCE(sum(p.views), 0) AS approved_listing_views,
  COALESCE(avg(p.views), 0)::numeric(14,2) AS average_approved_listing_views,
  COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY p.views), 0)::numeric(14,2) AS median_approved_listing_views
FROM public.user_listings l
JOIN public.properties p ON p.id = l.property_id
WHERE l.status = 'approved' AND p.is_active = true;

-- 7) Phone reveal and lead conversion. No lead/customer identity is returned.
SELECT
  count(*) AS phone_reveal_event_count,
  count(DISTINCT property_id) AS properties_with_phone_reveal,
  count(DISTINCT lead_id) AS leads_from_phone_reveal,
  min(created_at) AS first_phone_reveal_at,
  max(created_at) AS latest_phone_reveal_at
FROM public.property_phone_reveal_events;

SELECT
  count(*) AS total_lead_count,
  count(DISTINCT property_id) FILTER (WHERE property_id IS NOT NULL) AS properties_with_leads,
  count(*) FILTER (WHERE property_id IS NULL) AS leads_without_property,
  count(*) FILTER (WHERE source = 'property_phone_reveal') AS phone_reveal_leads,
  min(created_at) AS first_lead_at,
  max(created_at) AS latest_lead_at
FROM public.leads;

SELECT
  status,
  count(*) AS lead_count,
  count(DISTINCT property_id) FILTER (WHERE property_id IS NOT NULL) AS properties_with_leads
FROM public.leads
GROUP BY status
ORDER BY status;

SELECT
  COALESCE(source, '(null)') AS source,
  count(*) AS lead_count,
  count(DISTINCT property_id) FILTER (WHERE property_id IS NOT NULL) AS properties_with_leads
FROM public.leads
GROUP BY source
ORDER BY lead_count DESC, source;

-- 8) Read-only data quality markers relevant to future package enforcement.
SELECT
  count(*) FILTER (WHERE user_id IS NULL) AS listings_without_owner,
  count(*) FILTER (WHERE property_id IS NULL) AS listings_without_property,
  count(*) FILTER (WHERE expires_at IS NULL) AS listings_without_expiry,
  count(*) FILTER (WHERE status = 'approved' AND property_id IS NULL) AS approved_without_property,
  count(*) FILTER (WHERE status = 'approved' AND expires_at IS NULL) AS approved_without_expiry
FROM public.user_listings;

-- 9) Compact JSON handoff marker; this is not a PASS/FAIL gate by itself.
SELECT jsonb_build_object(
  'measured_at', now(),
  'note', 'Interpret lifecycle rates only within audit coverage window; no mutation was performed.'
) AS commerce_baseline_handoff;
