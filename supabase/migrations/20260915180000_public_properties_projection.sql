-- Public property projection without contact fields.
-- Production execution is user-run after application readers are rewired.
-- This migration intentionally does not revoke access to public.properties yet.

BEGIN;

CREATE OR REPLACE VIEW public.public_properties
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.title,
  p.description,
  p.price,
  p.price_unit,
  p.price_label,
  p.price_per_month,
  p.loan_support,
  p.listing_type,
  p.area_sqm,
  p.address,
  p.city,
  p.district,
  p.ward,
  p.area_id,
  p.district_id,
  p.ward_id,
  p.property_type_id,
  p.neighborhood_slug,
  p.image_url,
  p.images,
  p.badge,
  p.badge_color,
  p.legal_status,
  p.is_featured,
  p.is_hot,
  p.is_active,
  p.is_verified,
  p.views,
  p.bedrooms,
  p.bathrooms,
  p.floor_count,
  p.floor_number,
  p.direction,
  p.road_width,
  p.frontage,
  p.amenities,
  p.latitude,
  p.longitude,
  p.formatted_address,
  p.vr_tour_url,
  p.video_url,
  p.tags,
  p.meta_title,
  p.meta_description,
  p.focus_keywords,
  p.schema_markup,
  p.slug,
  p.public_code,
  p.faq,
  p.created_at,
  p.updated_at
FROM public.properties AS p
WHERE p.is_active = true;

REVOKE ALL ON public.public_properties FROM PUBLIC;
GRANT SELECT ON public.public_properties TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Final privacy migration is intentionally separate and must run only after all
-- public readers use public.public_properties:
-- REVOKE SELECT ON public.properties FROM anon;
