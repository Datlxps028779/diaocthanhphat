/*
# Real Estate Platform Schema (NhaDatKetNoi)

## Summary
Creates the full backend for a Vietnamese real estate listing platform with:
- Properties table for all listings (title, price, area, location, type, etc.)
- Areas/regions table for the 4 operating zones
- Testimonials from clients
- Leads/contact requests from prospective buyers
- Admin users with email/password auth

## New Tables
1. `areas` - Operating regions (TP.HCM, Bình Dương, Đồng Nai, Bình Phước)
2. `property_types` - Property categories (Đất nền, Nhà phố, Biệt thự, etc.)
3. `properties` - Main listings with full details
4. `testimonials` - Client reviews and testimonials
5. `leads` - Contact/inquiry form submissions

## Security
- RLS enabled on all tables
- Public (anon + authenticated) read on properties, areas, types, testimonials
- Insert-only for leads (public can submit)
- Admin-level write (authenticated) for properties, areas, testimonials
*/

-- Areas table
CREATE TABLE IF NOT EXISTS areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  image_url text,
  slug text UNIQUE NOT NULL,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_areas" ON areas;
CREATE POLICY "public_select_areas" ON areas FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_areas" ON areas;
CREATE POLICY "auth_insert_areas" ON areas FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_areas" ON areas;
CREATE POLICY "auth_update_areas" ON areas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_areas" ON areas;
CREATE POLICY "auth_delete_areas" ON areas FOR DELETE TO authenticated USING (true);

-- Property types table
CREATE TABLE IF NOT EXISTS property_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  icon text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE property_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_property_types" ON property_types;
CREATE POLICY "public_select_property_types" ON property_types FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_property_types" ON property_types;
CREATE POLICY "auth_insert_property_types" ON property_types FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_property_types" ON property_types;
CREATE POLICY "auth_update_property_types" ON property_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_property_types" ON property_types;
CREATE POLICY "auth_delete_property_types" ON property_types FOR DELETE TO authenticated USING (true);

-- Properties table
CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  price numeric NOT NULL,
  price_unit text NOT NULL DEFAULT 'tỷ',
  price_label text,
  area_sqm numeric,
  address text,
  city text NOT NULL,
  district text,
  area_id uuid REFERENCES areas(id) ON DELETE SET NULL,
  property_type_id uuid REFERENCES property_types(id) ON DELETE SET NULL,
  image_url text,
  badge text,
  badge_color text DEFAULT 'red',
  legal_status text,
  is_featured boolean DEFAULT false,
  is_hot boolean DEFAULT false,
  is_active boolean DEFAULT true,
  views integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_properties_area_id ON properties(area_id);
CREATE INDEX IF NOT EXISTS idx_properties_property_type_id ON properties(property_type_id);
CREATE INDEX IF NOT EXISTS idx_properties_is_featured ON properties(is_featured);
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_properties" ON properties;
CREATE POLICY "public_select_properties" ON properties FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "auth_insert_properties" ON properties;
CREATE POLICY "auth_insert_properties" ON properties FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_properties" ON properties;
CREATE POLICY "auth_update_properties" ON properties FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_properties" ON properties;
CREATE POLICY "auth_delete_properties" ON properties FOR DELETE TO authenticated USING (true);

-- Testimonials table
CREATE TABLE IF NOT EXISTS testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  content text NOT NULL,
  rating integer DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  avatar_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_testimonials" ON testimonials;
CREATE POLICY "public_select_testimonials" ON testimonials FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "auth_insert_testimonials" ON testimonials;
CREATE POLICY "auth_insert_testimonials" ON testimonials FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_testimonials" ON testimonials;
CREATE POLICY "auth_update_testimonials" ON testimonials FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_testimonials" ON testimonials;
CREATE POLICY "auth_delete_testimonials" ON testimonials FOR DELETE TO authenticated USING (true);

-- Leads / contact requests
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  area_interest text,
  message text,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  status text DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_leads" ON leads;
CREATE POLICY "public_insert_leads" ON leads FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_select_leads" ON leads;
CREATE POLICY "auth_select_leads" ON leads FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_update_leads" ON leads;
CREATE POLICY "auth_update_leads" ON leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_leads" ON leads;
CREATE POLICY "auth_delete_leads" ON leads FOR DELETE TO authenticated USING (true);

-- Seed: Areas
INSERT INTO areas (name, description, slug, order_index, image_url) VALUES
('TP. Hồ Chí Minh', 'Trung tâm kinh tế - tài chính lớn nhất cả nước, thu hút đầu tư bất động sản ở mức cao.', 'tp-hcm', 1, 'https://images.pexels.com/photos/6177618/pexels-photo-6177618.jpeg'),
('Bình Dương', 'Thủ phủ công nghiệp, hạ tầng đồng bộ, thu hút FDI - động lực tăng trưởng dài hạn.', 'binh-duong', 2, 'https://images.pexels.com/photos/1642125/pexels-photo-1642125.jpeg'),
('Đồng Nai', 'Hạ tầng kết nối hoàn thiện, sân bay Long Thành thúc đẩy động vốn đầu tư.', 'dong-nai', 3, 'https://images.pexels.com/photos/2119713/pexels-photo-2119713.jpeg'),
('Bình Phước', 'Quỹ đất lớn, giá còn thấp, tiềm năng tăng giá mạnh trong tương lai.', 'binh-phuoc', 4, 'https://images.pexels.com/photos/440731/pexels-photo-440731.jpeg')
ON CONFLICT (slug) DO NOTHING;

-- Seed: Property types
INSERT INTO property_types (name, slug) VALUES
('Đất nền', 'dat-nen'),
('Nhà phố', 'nha-pho'),
('Biệt thự', 'biet-thu'),
('Khu công nghiệp', 'khu-cong-nghiep'),
('Đất dự án', 'dat-du-an'),
('Nhà ở xã hội', 'nha-o-xa-hoi')
ON CONFLICT (slug) DO NOTHING;

-- Seed: Properties
INSERT INTO properties (title, price, price_unit, price_label, area_sqm, address, city, district, badge, badge_color, legal_status, is_featured, is_hot, image_url, description) VALUES
('Đất nền sổ đỏ KDC Phú Hồng Thịnh 8', 2.15, 'tỷ', '2,15 tỷ / nền', 100, 'Dĩ An', 'Bình Dương', 'Dĩ An', 'MỚI NHẤT', 'green', 'Thổ cư 100%', true, false, 'https://images.pexels.com/photos/1115804/pexels-photo-1115804.jpeg', 'Đất nền sổ đỏ trao tay, pháp lý minh bạch, vị trí đắc địa tại Dĩ An, Bình Dương.'),
('Nhà phố 1 trệt 2 lầu KDC Hiệp Thành 3', 3.85, 'tỷ', '3,85 tỷ / căn', 80, 'Thủ Dầu Một', 'Bình Dương', 'Thủ Dầu Một', 'ĐANG HOT', 'orange', 'Sổ hồng riêng', true, true, 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg', 'Nhà phố thiết kế hiện đại, full nội thất, an ninh 24/7.'),
('Đất nền ven sông Đồng Nai', 1.95, 'tỷ', '1,95 tỷ / nền', 120, 'Biên Hòa', 'Đồng Nai', 'Biên Hòa', 'NỔI BẬT', 'red', 'Thổ cư 100%', true, false, 'https://images.pexels.com/photos/280222/pexels-photo-280222.jpeg', 'Đất nền cạnh sông, không khí trong lành, tiềm năng tăng giá cao.'),
('Đất nền KCN Becamex Chơn Thành', 850, 'triệu', '850 triệu / nền', 150, 'Chơn Thành', 'Bình Phước', 'Chơn Thành', 'TIỀM NĂNG', 'blue', 'Sổ hồng riêng', true, false, 'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg', 'Đất nền liền kề khu công nghiệp Becamex, thanh khoản cao.'),
('Nhà phố trung tâm TP. Biên Hòa', 4.60, 'tỷ', '4,60 tỷ / căn', 90, 'Biên Hòa', 'Đồng Nai', 'Biên Hòa', 'NỔI BẬT', 'red', 'Hoàn công đầy đủ', true, false, 'https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg', 'Nhà phố trung tâm, tiện ích đầy đủ, hoàn công sẵn.'),
('Biệt thự vườn Thủ Đức', 8.50, 'tỷ', '8,5 tỷ / căn', 250, 'TP. Thủ Đức', 'TP. Hồ Chí Minh', 'Thủ Đức', 'CAO CẤP', 'purple', 'Sổ hồng riêng', false, true, 'https://images.pexels.com/photos/1732414/pexels-photo-1732414.jpeg', 'Biệt thự vườn cao cấp, hồ bơi riêng, không gian xanh mát.'),
('Đất dự án Long An mặt tiền QL1', 1.20, 'tỷ', '1,2 tỷ / nền', 95, 'Bến Lức', 'Long An', 'Bến Lức', 'MỚI NHẤT', 'green', 'Thổ cư 100%', false, false, 'https://images.pexels.com/photos/259588/pexels-photo-259588.jpeg', 'Đất mặt tiền quốc lộ, thuận tiện kinh doanh, pháp lý rõ ràng.'),
('Nhà xã hội Bình Dương giá rẻ', 950, 'triệu', '950 triệu / căn', 60, 'Thuận An', 'Bình Dương', 'Thuận An', 'XÃ HỘI', 'teal', 'Sổ hồng riêng', false, false, 'https://images.pexels.com/photos/1546168/pexels-photo-1546168.jpeg', 'Nhà ở xã hội dành cho người thu nhập thấp, vay ưu đãi lãi suất thấp.')
ON CONFLICT DO NOTHING;

-- Seed: Testimonials
INSERT INTO testimonials (name, location, content, rating) VALUES
('Anh Minh Tuấn', 'Thủ Đức, TP. Hồ Chí Minh', 'Tôi đã đầu tư 3 nền đất nền tại đây, thông tin rõ ràng, hỗ trợ tốt tận tình và thủ tục dễ dàng.', 5),
('Chị Hoàng Yến', 'Thuận An, Bình Dương', 'Nhờ bên tư vấn mà tôi mua được căn nhà ưng ý, vị trí tốt, thanh toán linh hoạt và an toàn.', 5),
('Anh Quốc Huy', 'Biên Hòa, Đồng Nai', 'Thông tin rất minh bạch, tôi tin tưởng trao giao dịch. Rất đáng tin cậy!', 5)
ON CONFLICT DO NOTHING;
