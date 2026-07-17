INSERT INTO property_types (name, slug, icon)
VALUES
  ('Dãy trọ', 'day-tro', 'Building2'),
  ('Chung cư', 'chung-cu', 'Building')
ON CONFLICT (slug) DO NOTHING;
