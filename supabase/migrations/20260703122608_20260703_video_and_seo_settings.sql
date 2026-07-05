-- Add video_url to properties and user_listings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='video_url') THEN
    ALTER TABLE properties ADD COLUMN video_url TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='video_url') THEN
    ALTER TABLE user_listings ADD COLUMN video_url TEXT;
  END IF;
END $$;

-- Seed comprehensive site_settings rows for branding, SEO, contact, social
INSERT INTO site_settings (key, value, label, group_name, type)
VALUES
  ('favicon_url', '', 'URL Favicon (.ico/.png)', 'general', 'url'),
  ('meta_title', 'BĐS Bình Dương – Mua Bán Cho Thuê Bất Động Sản Uy Tín', 'Meta Title mặc định', 'seo', 'text'),
  ('meta_description', 'Kênh bất động sản uy tín tại Bình Dương. Mua bán, cho thuê nhà đất, căn hộ, đất nền toàn tỉnh Bình Dương và lân cận.', 'Meta Description mặc định', 'seo', 'textarea'),
  ('meta_keywords', 'bất động sản bình dương, nhà đất bình dương, mua bán nhà, cho thuê nhà bình dương', 'Meta Keywords', 'seo', 'text'),
  ('og_image', '', 'OG Image URL (cho mạng xã hội)', 'seo', 'url'),
  ('google_analytics_id', '', 'Google Analytics Tracking ID', 'seo', 'text'),
  ('webhook_url', '', 'Webhook CRM URL (Bizfly/GetFly)', 'contact', 'url'),
  ('zalo_oa_id', '', 'Zalo OA ID', 'contact', 'text')
ON CONFLICT (key) DO NOTHING;
