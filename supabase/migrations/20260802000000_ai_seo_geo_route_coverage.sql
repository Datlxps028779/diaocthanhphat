-- AI SEO/GEO MVP route coverage
-- Additive and idempotent: make remaining public routes editable via seo_route_overrides.

INSERT INTO seo_route_overrides (path, robots_index, robots_follow) VALUES
  ('/so-sanh', true, true),
  ('/dinh-gia', true, true),
  ('/du-an', true, true),
  ('/dau-tu', true, true)
ON CONFLICT (path) DO NOTHING;

NOTIFY pgrst, 'reload schema';
