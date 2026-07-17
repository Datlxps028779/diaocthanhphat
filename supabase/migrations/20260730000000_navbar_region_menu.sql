INSERT INTO site_content (section, key, value, label, type, order_index)
VALUES
  ('navbar', 'menu_regions', 'Tìm theo khu vực', 'Menu: Tìm theo khu vực', 'text', 35),
  ('navbar', 'menu_regions_all', 'Tất cả khu vực', 'Menu khu vực: Tất cả khu vực', 'text', 36),
  ('navbar', 'menu_valuation', 'Định giá', 'Menu: Định giá', 'text', 65)
ON CONFLICT (section, key) DO UPDATE
SET label = EXCLUDED.label,
    type = EXCLUDED.type,
    order_index = EXCLUDED.order_index;

INSERT INTO site_content (section, key, value, label, type, order_index)
SELECT
  'navbar',
  'menu_region_' || a.slug,
  a.name,
  'Menu khu vực: ' || a.name,
  'text',
  40 + COALESCE(a.order_index, 0)
FROM areas a
ON CONFLICT (section, key) DO UPDATE
SET label = EXCLUDED.label,
    type = EXCLUDED.type,
    order_index = EXCLUDED.order_index;
