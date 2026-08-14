-- Configure Google Ads conversion tracking through Admin → Settings → SEO.
-- IDs are stored as text; the application validates before rendering a script.
INSERT INTO public.site_settings (key, value, label, group_name, type)
VALUES
  ('google_ads_id', 'AW-18379274535', 'Google Ads ID (AW-...)', 'seo', 'text'),
  ('google_ads_lead_conversion', 'AW-18379274535/4QdoCJrk_uAcEKfy9btE', 'Google Ads conversion lead (AW-.../label)', 'seo', 'text')
ON CONFLICT (key) DO NOTHING;
