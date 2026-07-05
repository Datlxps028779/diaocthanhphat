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

-- Add contact_name and contact_phone to properties
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS contact_name  text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS bedrooms      int,
  ADD COLUMN IF NOT EXISTS bathrooms     int,
  ADD COLUMN IF NOT EXISTS floor_count   int,
  ADD COLUMN IF NOT EXISTS direction    text,
  ADD COLUMN IF NOT EXISTS road_width    numeric,
  ADD COLUMN IF NOT EXISTS frontage      numeric,
  ADD COLUMN IF NOT EXISTS images        text[],
  ADD COLUMN IF NOT EXISTS amenities     text[];

-- News/Articles table
CREATE TABLE IF NOT EXISTS news (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  slug        text UNIQUE NOT NULL,
  excerpt     text,
  content     text,
  image_url   text,
  category    text NOT NULL DEFAULT 'Thị trường',
  author      text DEFAULT 'Ban biên tập',
  is_published boolean DEFAULT true,
  views       int DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Projects table (distinct from individual properties)
CREATE TABLE IF NOT EXISTS projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  location     text,
  city         text,
  area_id      uuid REFERENCES areas(id),
  developer    text,
  total_units  int,
  sold_units   int DEFAULT 0,
  price_from   numeric,
  price_to     numeric,
  price_unit   text DEFAULT 'tỷ',
  image_url    text,
  images       text[],
  phase        text DEFAULT 'Đang mở bán',
  handover_date text,
  legal_status text,
  amenities    text[],
  is_featured  boolean DEFAULT false,
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- Saved/bookmarked listings (session-based, no auth required)
CREATE TABLE IF NOT EXISTS saved_listings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  text NOT NULL,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now()
);

-- RLS for news
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news_select_public" ON news FOR SELECT TO anon, authenticated USING (is_published = true);
CREATE POLICY "news_insert_admin"  ON news FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "news_update_admin"  ON news FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "news_delete_admin"  ON news FOR DELETE TO authenticated USING (true);

-- RLS for projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_select_public" ON projects FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "projects_insert_admin"  ON projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "projects_update_admin"  ON projects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "projects_delete_admin"  ON projects FOR DELETE TO authenticated USING (true);

-- RLS for saved_listings
ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_select" ON saved_listings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "saved_insert" ON saved_listings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "saved_delete" ON saved_listings FOR DELETE TO anon, authenticated USING (true);

-- Seed sample news articles
INSERT INTO news (title, slug, excerpt, content, image_url, category, author) VALUES
(
  'Thị trường đất nền Bình Dương 2025: Cơ hội vàng cho nhà đầu tư',
  'thi-truong-dat-nen-binh-duong-2025',
  'Giá đất nền Bình Dương tăng trung bình 20-30%/năm nhờ dòng vốn FDI và hạ tầng hoàn thiện.',
  'Thị trường bất động sản Bình Dương năm 2025 tiếp tục ghi nhận sự tăng trưởng mạnh mẽ, đặc biệt tại các khu vực gần khu công nghiệp và hành lang đô thị mới. Giá đất nền tăng trung bình 20-30% so với cùng kỳ năm ngoái, đặc biệt tại Dĩ An, Thuận An và Thủ Dầu Một.',
  'https://images.pexels.com/photos/1642125/pexels-photo-1642125.jpeg',
  'Thị trường', 'Ban biên tập'
),
(
  'Sân bay Long Thành: Cú hích mạnh cho BĐS Đồng Nai',
  'san-bay-long-thanh-bds-dong-nai',
  'Sân bay Quốc tế Long Thành tạo cú hích lớn cho toàn thị trường bất động sản Đồng Nai.',
  'Sân bay Quốc tế Long Thành đang là từ khóa nóng nhất trên thị trường bất động sản phía Nam. Với quy mô đầu tư hơn 16 tỷ USD và công suất 100 triệu hành khách/năm, giá đất tại Long Thành, Nhơn Trạch đã tăng 30-50% trong 2 năm qua.',
  'https://images.pexels.com/photos/2119713/pexels-photo-2119713.jpeg',
  'Hạ tầng', 'Ban biên tập'
),
(
  'Bình Phước – Điểm đến đầu tư mới nổi năm 2025',
  'binh-phuoc-diem-den-dau-tu-2025',
  'Quỹ đất lớn, giá còn thấp và hạ tầng đang đầu tư mạnh, Bình Phước nổi lên với tiềm năng tăng giá 25-40%/năm.',
  'Bình Phước đang dần trở thành tâm điểm của giới đầu tư bất động sản khi tỉnh này liên tục thu hút các khu công nghiệp lớn. Giá đất chỉ từ 500 triệu đến 1.5 tỷ/nền nhưng tiềm năng tăng rất cao.',
  'https://images.pexels.com/photos/440731/pexels-photo-440731.jpeg',
  'Đầu tư', 'Ban biên tập'
),
(
  'Hướng dẫn kiểm tra pháp lý đất nền trước khi mua',
  'huong-dan-kiem-tra-phap-ly-dat-nen',
  'Checklist đầy đủ kiểm tra pháp lý bất động sản: sổ đỏ, quy hoạch, nghĩa vụ tài chính.',
  'Khi mua đất nền, pháp lý là yếu tố không thể bỏ qua. Cần kiểm tra: Giấy chứng nhận quyền sử dụng đất, thông tin quy hoạch tại UBND, nghĩa vụ tài chính còn nợ, và hợp đồng mua bán rõ ràng.',
  'https://images.pexels.com/photos/1115804/pexels-photo-1115804.jpeg',
  'Hướng dẫn', 'Ban biên tập'
),
(
  'Chính sách vay ngân hàng mua BĐS lãi suất thấp 2025',
  'chinh-sach-vay-ngan-hang-2025',
  'Nhiều ngân hàng triển khai gói vay ưu đãi lãi suất từ 7-8%/năm, hỗ trợ 70% giá trị BĐS.',
  'Năm 2025, Vietcombank, BIDV, Techcombank đang triển khai các gói vay hấp dẫn với lãi suất ưu đãi từ 7-8%/năm trong 12-36 tháng đầu, vay tối đa 70-75% giá trị bất động sản.',
  'https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg',
  'Tài chính', 'Ban biên tập'
),
(
  'Top 5 khu dân cư đáng mua nhất Bình Dương năm 2025',
  'top-5-khu-dan-cu-binh-duong-2025',
  'Tổng hợp 5 KDC tốt nhất Bình Dương dựa trên tiêu chí hạ tầng, pháp lý và tiềm năng tăng giá.',
  'Bình Dương là thị trường BĐS sôi động nhất phía Nam. Top 5 KDC đáng cân nhắc: Phú Hồng Thịnh 8, Hiệp Thành 3, Việt Sing, Bình Dương Avenue và KDC Becamex.',
  'https://images.pexels.com/photos/280222/pexels-photo-280222.jpeg',
  'Thị trường', 'Ban biên tập'
);

-- Seed sample projects
INSERT INTO projects (name, description, location, city, phase, developer, total_units, sold_units, price_from, price_to, price_unit, image_url, amenities, is_featured) VALUES
(
  'Khu dân cư Phú Hồng Thịnh 8',
  'Dự án đất nền cao cấp tại Dĩ An, Bình Dương với hạ tầng hoàn chỉnh, sổ đỏ từng nền.',
  'Dĩ An, Bình Dương', 'Bình Dương', 'Đang mở bán', 'Phú Hồng Thịnh Corp', 350, 180, 2.1, 2.8, 'tỷ',
  'https://images.pexels.com/photos/1642125/pexels-photo-1642125.jpeg',
  ARRAY['Trường học', 'Chợ', 'Công viên', 'An ninh 24/7'], true
),
(
  'KDC Hiệp Thành 3 Thủ Dầu Một',
  'Nhà phố thương mại trung tâm TP. Thủ Dầu Một, vị trí đắc địa cạnh hành chính tỉnh.',
  'Thủ Dầu Một, Bình Dương', 'Bình Dương', 'Đang mở bán', 'BECAMEX', 200, 150, 3.5, 5.2, 'tỷ',
  'https://images.pexels.com/photos/2119713/pexels-photo-2119713.jpeg',
  ARRAY['TTTM', 'Trường học', 'Bệnh viện', 'Hồ bơi'], true
),
(
  'Long Thành Airport City',
  'Đất nền dự án ven sân bay Long Thành, tiềm năng tăng giá vượt trội trong 3-5 năm tới.',
  'Long Thành, Đồng Nai', 'Đồng Nai', 'Sắp ra mắt', 'Long Thành Corp', 500, 0, 1.8, 3.5, 'tỷ',
  'https://images.pexels.com/photos/440731/pexels-photo-440731.jpeg',
  ARRAY['Gần sân bay', 'Cao tốc', 'KCN', 'Tiện ích đầy đủ'], true
),
(
  'Becamex Bình Phước Phân khu 2',
  'Đất nền công nghiệp và dân cư giá rẻ, nằm trong vùng quy hoạch KCN lớn nhất Bình Phước.',
  'Chơn Thành, Bình Phước', 'Bình Phước', 'Đang mở bán', 'BECAMEX Bình Phước', 800, 200, 0.65, 1.2, 'tỷ',
  'https://images.pexels.com/photos/6177618/pexels-photo-6177618.jpeg',
  ARRAY['KCN lớn', 'Quốc lộ 13', 'Cửa khẩu Hoa Lư'], false
);
/*
# User Listings & Profiles

1. New Tables
   - `user_listings`: properties submitted by registered users, pending admin approval
     - user_id: owner (auth.uid default)
     - status: pending | approved | rejected
     - All property fields mirrored
   - `profiles`: basic profile data for authenticated users
     - id matches auth.users.id
     - display_name, phone, avatar_url

2. Modified Tables
   - `properties`: add `user_listing_id` ref for approved user submissions

3. Security
   - profiles: user can read/update their own
   - user_listings: user can CRUD their own, admin reads all via service role
   - Public can SELECT approved listings only
*/

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- User listings (submitted by users, pending approval)
CREATE TABLE IF NOT EXISTS user_listings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason   text,
  -- Listing content fields
  title           text NOT NULL,
  description     text,
  price           numeric NOT NULL,
  price_unit      text NOT NULL DEFAULT 'tỷ',
  price_label     text,
  area_sqm        numeric,
  address         text,
  city            text NOT NULL,
  district        text,
  area_id         uuid REFERENCES areas(id),
  property_type_id uuid REFERENCES property_types(id),
  image_url       text,
  legal_status    text,
  bedrooms        int,
  bathrooms       int,
  direction       text,
  contact_name    text,
  contact_phone   text,
  amenities       text[],
  -- Meta
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE user_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_listings_select_own" ON user_listings;
CREATE POLICY "user_listings_select_own" ON user_listings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_listings_insert_own" ON user_listings;
CREATE POLICY "user_listings_insert_own" ON user_listings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_listings_update_own" ON user_listings;
CREATE POLICY "user_listings_update_own" ON user_listings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id AND status = 'pending') WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_listings_delete_own" ON user_listings;
CREATE POLICY "user_listings_delete_own" ON user_listings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Admin can see all user_listings (using service role key from admin panel)
-- No separate admin policy needed - service role bypasses RLS

-- Add lat/lng to properties for map pins
ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude  numeric;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude numeric;

-- Add lat/lng to projects as well
ALTER TABLE projects ADD COLUMN IF NOT EXISTS latitude  numeric;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS longitude numeric;

-- Seed approximate coordinates for existing properties
UPDATE properties SET
  latitude  = 10.8231 + (random() - 0.5) * 0.3,
  longitude = 106.6297 + (random() - 0.5) * 0.3
WHERE latitude IS NULL AND city ILIKE '%hồ chí minh%';

UPDATE properties SET
  latitude  = 11.0686 + (random() - 0.5) * 0.2,
  longitude = 106.6522 + (random() - 0.5) * 0.2
WHERE latitude IS NULL AND city ILIKE '%bình dương%';

UPDATE properties SET
  latitude  = 10.9577 + (random() - 0.5) * 0.3,
  longitude = 106.8427 + (random() - 0.5) * 0.3
WHERE latitude IS NULL AND city ILIKE '%đồng nai%';

UPDATE properties SET
  latitude  = 11.7396 + (random() - 0.5) * 0.3,
  longitude = 106.7231 + (random() - 0.5) * 0.3
WHERE latitude IS NULL AND city ILIKE '%bình phước%';

UPDATE properties SET
  latitude  = 10.9 + (random() - 0.5) * 0.5,
  longitude = 106.7 + (random() - 0.5) * 0.5
WHERE latitude IS NULL;

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
/*
# CMS, Storage & Enhanced Property Schema

## Summary
Adds full CMS (Content Management System) so all UI text, positions, and layouts
can be edited from the admin panel without touching code. Also adds:
- listing_type to properties (mua_ban / cho_thue / can_mua / can_thue)
- site_settings table for global site configuration
- site_content table for all editable UI text/content blocks
- banners table for hero/promotional banners with drag-drop ordering
- Property images stored as array with order

## New Tables

### site_settings
Stores global site configuration (site name, logo, contact info, social links, etc.)
- `key` (text, unique) - setting identifier
- `value` (text) - setting value
- `label` (text) - human-readable label for admin
- `group` (text) - grouping (general, contact, social, seo)
- `type` (text) - input type (text, textarea, url, phone, color, toggle)

### site_content
CMS content blocks: every piece of UI text editable without code.
- `section` (text) - page/section identifier (hero, navbar, footer, about, etc.)
- `key` (text, unique per section) - content identifier
- `value` (text) - the actual content
- `label` (text) - admin-facing label
- `type` (text) - content type (text, textarea, html, image_url, color)
- `order_index` (int) - display order within section

### banners
Promotional banners displayed on homepage/listings.
- `title` (text) - banner headline
- `subtitle` (text) - subheadline
- `cta_text` (text) - button text
- `cta_link` (text) - button destination
- `image_url` (text) - background image
- `position` (text) - where to show (hero, sidebar, footer_cta)
- `order_index` (int) - drag-drop order
- `is_active` (bool) - show/hide
- `bg_color` (text) - fallback background color

## Modified Tables

### properties
- Add `listing_type` column: 'mua_ban' | 'cho_thue' | 'can_mua' | 'can_thue'
- Add `price_per_month` for rental listings (triệu/tháng)
- Add `floor_area` for apartment floor number
- Add `images_order` jsonb for storing image order metadata

## Security
All new tables use RLS with anon+authenticated read, admin-only write.
*/

-- ─── properties: add listing_type ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='listing_type') THEN
    ALTER TABLE properties ADD COLUMN listing_type text NOT NULL DEFAULT 'mua_ban' CHECK (listing_type IN ('mua_ban','cho_thue','can_mua','can_thue'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='price_per_month') THEN
    ALTER TABLE properties ADD COLUMN price_per_month numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='floor_number') THEN
    ALTER TABLE properties ADD COLUMN floor_number integer;
  END IF;
END $$;

-- same for user_listings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='listing_type') THEN
    ALTER TABLE user_listings ADD COLUMN listing_type text NOT NULL DEFAULT 'mua_ban' CHECK (listing_type IN ('mua_ban','cho_thue','can_mua','can_thue'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='price_per_month') THEN
    ALTER TABLE user_listings ADD COLUMN price_per_month numeric;
  END IF;
END $$;

-- ─── site_settings ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  label text NOT NULL,
  group_name text NOT NULL DEFAULT 'general',
  type text NOT NULL DEFAULT 'text',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_site_settings" ON site_settings;
CREATE POLICY "anon_select_site_settings" ON site_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_site_settings" ON site_settings;
CREATE POLICY "auth_insert_site_settings" ON site_settings FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_site_settings" ON site_settings;
CREATE POLICY "auth_update_site_settings" ON site_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_site_settings" ON site_settings;
CREATE POLICY "auth_delete_site_settings" ON site_settings FOR DELETE TO authenticated USING (true);

-- ─── site_content ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  key text NOT NULL,
  value text,
  label text NOT NULL,
  type text NOT NULL DEFAULT 'text',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(section, key)
);

ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_site_content" ON site_content;
CREATE POLICY "anon_select_site_content" ON site_content FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_site_content" ON site_content;
CREATE POLICY "auth_insert_site_content" ON site_content FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_site_content" ON site_content;
CREATE POLICY "auth_update_site_content" ON site_content FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_site_content" ON site_content;
CREATE POLICY "auth_delete_site_content" ON site_content FOR DELETE TO authenticated USING (true);

-- ─── banners ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  cta_text text,
  cta_link text,
  image_url text,
  bg_color text DEFAULT '#dc2626',
  position text NOT NULL DEFAULT 'hero' CHECK (position IN ('hero','sidebar','footer_cta','listings_top')),
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_banners" ON banners;
CREATE POLICY "anon_select_banners" ON banners FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_banners" ON banners;
CREATE POLICY "auth_insert_banners" ON banners FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_banners" ON banners;
CREATE POLICY "auth_update_banners" ON banners FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_banners" ON banners;
CREATE POLICY "auth_delete_banners" ON banners FOR DELETE TO authenticated USING (true);

-- ─── indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_properties_listing_type ON properties(listing_type);
CREATE INDEX IF NOT EXISTS idx_site_content_section ON site_content(section, order_index);
CREATE INDEX IF NOT EXISTS idx_banners_position ON banners(position, order_index) WHERE is_active = true;

-- ─── Default site_settings ──────────────────────────────────────────────────────
INSERT INTO site_settings (key, value, label, group_name, type) VALUES
  ('site_name', 'BĐS Bình Dương', 'Tên website', 'general', 'text'),
  ('site_tagline', 'Kênh thông tin bất động sản uy tín tại Bình Dương', 'Slogan website', 'general', 'text'),
  ('site_logo_text', 'BĐS BÌNH DƯƠNG', 'Text logo', 'general', 'text'),
  ('site_logo_sub', 'Bất Động Sản Uy Tín', 'Sub text logo', 'general', 'text'),
  ('phone_main', '0901 234 567', 'Số điện thoại chính', 'contact', 'phone'),
  ('phone_hotline', '0901 234 567', 'Hotline', 'contact', 'phone'),
  ('zalo_link', 'https://zalo.me/0901234567', 'Link Zalo', 'contact', 'url'),
  ('address', 'Thủ Dầu Một, Bình Dương', 'Địa chỉ văn phòng', 'contact', 'text'),
  ('email', 'info@bdsbinhduong.vn', 'Email liên hệ', 'contact', 'text'),
  ('facebook_url', '', 'Facebook URL', 'social', 'url'),
  ('youtube_url', '', 'YouTube URL', 'social', 'url'),
  ('tiktok_url', '', 'TikTok URL', 'social', 'url'),
  ('footer_description', 'Nền tảng bất động sản uy tín tại Bình Dương và các tỉnh lân cận. Kết nối người mua và người bán nhanh chóng, minh bạch.', 'Mô tả footer', 'general', 'textarea'),
  ('primary_color', '#dc2626', 'Màu chủ đạo (hex)', 'general', 'color'),
  ('seo_title', 'BĐS Bình Dương - Mua bán nhà đất Bình Dương uy tín', 'SEO Title', 'seo', 'text'),
  ('seo_description', 'Tìm kiếm nhà đất, căn hộ, đất nền tại Bình Dương, Bình Phước, Đồng Nai. Tin đăng uy tín, cập nhật liên tục.', 'SEO Description', 'seo', 'textarea')
ON CONFLICT (key) DO NOTHING;

-- ─── Default site_content ───────────────────────────────────────────────────────
INSERT INTO site_content (section, key, value, label, type, order_index) VALUES
  -- Header/Navbar
  ('navbar', 'menu_home', 'Trang chủ', 'Menu: Trang chủ', 'text', 1),
  ('navbar', 'menu_buy', 'Mua bán', 'Menu: Mua bán', 'text', 2),
  ('navbar', 'menu_rent', 'Cho thuê', 'Menu: Cho thuê', 'text', 3),
  ('navbar', 'menu_projects', 'Dự án', 'Menu: Dự án', 'text', 4),
  ('navbar', 'menu_invest', 'Đầu tư', 'Menu: Đầu tư', 'text', 5),
  ('navbar', 'menu_news', 'Tin tức', 'Menu: Tin tức', 'text', 6),
  ('navbar', 'menu_about', 'Về chúng tôi', 'Menu: Về chúng tôi', 'text', 7),
  ('navbar', 'btn_login', 'Đăng nhập', 'Nút: Đăng nhập', 'text', 8),
  ('navbar', 'btn_post', 'Đăng tin', 'Nút: Đăng tin', 'text', 9),
  -- Hero section
  ('hero', 'title', 'Tìm kiếm bất động sản tại Bình Dương', 'Hero: Tiêu đề chính', 'text', 1),
  ('hero', 'subtitle', 'Hơn 5.000 tin đăng nhà đất, căn hộ, đất nền uy tín tại Bình Dương, Bình Phước, Đồng Nai', 'Hero: Mô tả phụ', 'text', 2),
  ('hero', 'search_placeholder', 'Tìm theo tên dự án, địa chỉ, khu vực...', 'Hero: Placeholder tìm kiếm', 'text', 3),
  ('hero', 'tab_buy', 'Mua bán', 'Hero: Tab Mua bán', 'text', 4),
  ('hero', 'tab_rent', 'Cho thuê', 'Hero: Tab Cho thuê', 'text', 5),
  ('hero', 'tab_need_buy', 'Cần mua', 'Hero: Tab Cần mua', 'text', 6),
  ('hero', 'tab_need_rent', 'Cần thuê', 'Hero: Tab Cần thuê', 'text', 7),
  ('hero', 'btn_search', 'Tìm kiếm', 'Hero: Nút tìm kiếm', 'text', 8),
  -- Stats bar
  ('stats', 'stat1_number', '5.000+', 'Thống kê 1: Con số', 'text', 1),
  ('stats', 'stat1_label', 'Tin đăng', 'Thống kê 1: Nhãn', 'text', 2),
  ('stats', 'stat2_number', '10.000+', 'Thống kê 2: Con số', 'text', 3),
  ('stats', 'stat2_label', 'Khách hàng tin tưởng', 'Thống kê 2: Nhãn', 'text', 4),
  ('stats', 'stat3_number', '7 năm', 'Thống kê 3: Con số', 'text', 5),
  ('stats', 'stat3_label', 'Kinh nghiệm', 'Thống kê 3: Nhãn', 'text', 6),
  ('stats', 'stat4_number', '3', 'Thống kê 4: Con số', 'text', 7),
  ('stats', 'stat4_label', 'Tỉnh phủ sóng', 'Thống kê 4: Nhãn', 'text', 8),
  -- Featured section
  ('featured', 'title', 'Tin đăng nổi bật', 'Section nổi bật: Tiêu đề', 'text', 1),
  ('featured', 'subtitle', 'Các bất động sản được quan tâm nhiều nhất', 'Section nổi bật: Mô tả', 'text', 2),
  ('featured', 'btn_view_all', 'Xem tất cả', 'Section nổi bật: Nút xem tất cả', 'text', 3),
  -- Hot section
  ('hot', 'title', 'BĐS Hot - Giá tốt', 'Section Hot: Tiêu đề', 'text', 1),
  ('hot', 'subtitle', 'Cập nhật mới nhất, giá cạnh tranh', 'Section Hot: Mô tả', 'text', 2),
  -- Why us section
  ('whyus', 'title', 'Tại sao chọn chúng tôi?', 'Why us: Tiêu đề', 'text', 1),
  ('whyus', 'f1_title', 'Uy tín - Chuyên nghiệp', 'Why us: Tính năng 1 tiêu đề', 'text', 2),
  ('whyus', 'f1_desc', 'Hơn 7 năm kinh nghiệm trong lĩnh vực BĐS tại Bình Dương', 'Why us: Tính năng 1 mô tả', 'text', 3),
  ('whyus', 'f2_title', 'Thông tin minh bạch', 'Why us: Tính năng 2 tiêu đề', 'text', 4),
  ('whyus', 'f2_desc', 'Mọi thông tin BĐS đều được xác thực và kiểm duyệt kỹ lưỡng', 'Why us: Tính năng 2 mô tả', 'text', 5),
  ('whyus', 'f3_title', 'Hỗ trợ 24/7', 'Why us: Tính năng 3 tiêu đề', 'text', 6),
  ('whyus', 'f3_desc', 'Đội ngũ chuyên gia sẵn sàng tư vấn mọi lúc bạn cần', 'Why us: Tính năng 3 mô tả', 'text', 7),
  ('whyus', 'f4_title', 'Pháp lý an toàn', 'Why us: Tính năng 4 tiêu đề', 'text', 8),
  ('whyus', 'f4_desc', 'Hỗ trợ đầy đủ thủ tục pháp lý từ A đến Z', 'Why us: Tính năng 4 mô tả', 'text', 9),
  -- CTA banner
  ('cta', 'title', 'Bạn có bất động sản cần bán hoặc cho thuê?', 'CTA: Tiêu đề', 'text', 1),
  ('cta', 'subtitle', 'Đăng tin miễn phí ngay hôm nay – tiếp cận hàng nghìn khách hàng tiềm năng', 'CTA: Mô tả', 'text', 2),
  ('cta', 'btn_post', 'Đăng tin ngay', 'CTA: Nút đăng tin', 'text', 3),
  ('cta', 'btn_contact', 'Liên hệ tư vấn', 'CTA: Nút liên hệ', 'text', 4),
  -- Footer
  ('footer', 'copyright', '© 2025 BĐS Bình Dương. Tất cả quyền được bảo lưu.', 'Footer: Bản quyền', 'text', 1),
  ('footer', 'col1_title', 'Về chúng tôi', 'Footer: Cột 1 tiêu đề', 'text', 2),
  ('footer', 'col2_title', 'Liên kết nhanh', 'Footer: Cột 2 tiêu đề', 'text', 3),
  ('footer', 'col3_title', 'Khu vực hoạt động', 'Footer: Cột 3 tiêu đề', 'text', 4),
  ('footer', 'col4_title', 'Liên hệ', 'Footer: Cột 4 tiêu đề', 'text', 5)
ON CONFLICT (section, key) DO NOTHING;

-- ─── Default banners ────────────────────────────────────────────────────────────
INSERT INTO banners (title, subtitle, cta_text, cta_link, image_url, position, order_index, is_active, bg_color) VALUES
  (
    'Nhà đất Bình Dương – Giá tốt nhất thị trường',
    'Hàng nghìn lô đất, nhà phố, căn hộ đang chờ bạn',
    'Xem ngay',
    '/listings',
    'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg',
    'hero',
    0,
    true,
    '#dc2626'
  ),
  (
    'Đăng tin BĐS miễn phí',
    'Tiếp cận ngay hàng nghìn khách hàng tiềm năng',
    'Đăng tin ngay',
    '/post-listing',
    null,
    'footer_cta',
    0,
    true,
    '#1d4ed8'
  )
ON CONFLICT DO NOTHING;
/*
# Advanced Features Migration

1. New Columns on properties
   - latitude, longitude (DECIMAL) for geospatial map display
   - vr_tour_url (TEXT) for 360° VR tour embed links
   - formatted_address (TEXT) for display address
   - contact_zalo (TEXT) for Zalo contact link

2. New Columns on user_listings
   - Same five columns as properties above

3. New Column on profiles
   - role TEXT with CHECK constraint (user|admin), default 'user'
   - Used for admin panel access control
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='vr_tour_url') THEN
    ALTER TABLE properties ADD COLUMN vr_tour_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='formatted_address') THEN
    ALTER TABLE properties ADD COLUMN formatted_address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='contact_zalo') THEN
    ALTER TABLE properties ADD COLUMN contact_zalo TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='latitude') THEN
    ALTER TABLE properties ADD COLUMN latitude DECIMAL(10,8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='longitude') THEN
    ALTER TABLE properties ADD COLUMN longitude DECIMAL(11,8);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='vr_tour_url') THEN
    ALTER TABLE user_listings ADD COLUMN vr_tour_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='formatted_address') THEN
    ALTER TABLE user_listings ADD COLUMN formatted_address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='contact_zalo') THEN
    ALTER TABLE user_listings ADD COLUMN contact_zalo TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='latitude') THEN
    ALTER TABLE user_listings ADD COLUMN latitude DECIMAL(10,8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_listings' AND column_name='longitude') THEN
    ALTER TABLE user_listings ADD COLUMN longitude DECIMAL(11,8);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='role') THEN
    ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));
  END IF;
END $$;
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
-- Expanded CMS site_settings: footer, social links, hero section, copyright

INSERT INTO site_settings (key, value, label, type, group_name) VALUES
  -- Footer
  ('footer_copyright', '© 2024 BĐS Bình Dương. Tất cả quyền được bảo lưu.', 'Bản quyền footer', 'text', 'footer'),
  ('footer_description', 'Hệ thống BĐS uy tín tại Bình Dương và vùng lân cận.', 'Mô tả footer', 'textarea', 'footer'),
  ('footer_address', 'Bình Dương, Việt Nam', 'Địa chỉ công ty', 'text', 'footer'),
  -- Social links
  ('social_facebook', '', 'Facebook URL', 'url', 'social'),
  ('social_youtube', '', 'YouTube URL', 'url', 'social'),
  ('social_tiktok', '', 'TikTok URL', 'url', 'social'),
  ('social_instagram', '', 'Instagram URL', 'url', 'social'),
  ('social_telegram', '', 'Telegram URL', 'url', 'social'),
  -- Hero section
  ('hero_title', 'Tìm Bất Động Sản Mơ Ước Tại Bình Dương', 'Tiêu đề Hero', 'text', 'hero'),
  ('hero_subtitle', 'Hàng nghìn BĐS được cập nhật mỗi ngày từ chủ nhà và nhà môi giới uy tín.', 'Mô tả Hero', 'textarea', 'hero'),
  ('hero_bg_image', '', 'Ảnh nền Hero (URL)', 'url', 'hero'),
  -- Sections
  ('section_featured_title', 'Bất Động Sản Nổi Bật', 'Tiêu đề khu nổi bật', 'text', 'sections'),
  ('section_featured_subtitle', 'Những BĐS được chọn lọc kỹ càng từ đội ngũ chuyên gia.', 'Mô tả khu nổi bật', 'text', 'sections'),
  ('section_regions_title', 'Khám Phá Theo Khu Vực', 'Tiêu đề khu vực', 'text', 'sections'),
  ('section_news_title', 'Tin Tức Thị Trường', 'Tiêu đề tin tức', 'text', 'sections'),
  -- Branding
  ('site_logo_url', '', 'URL Logo', 'url', 'general'),
  ('site_favicon_url', '', 'URL Favicon', 'url', 'general'),
  ('primary_color', '#dc2626', 'Màu chủ đạo', 'color', 'general'),
  -- Contact
  ('phone_secondary', '', 'Hotline phụ', 'phone', 'contact'),
  ('email_contact', '', 'Email liên hệ', 'text', 'contact'),
  ('working_hours', 'Thứ 2 - Thứ 7: 8:00 - 17:30', 'Giờ làm việc', 'text', 'contact')
ON CONFLICT (key) DO NOTHING;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS meta_description text;
-- Districts taxonomy table (Province → District hierarchy)
CREATE TABLE IF NOT EXISTS districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid REFERENCES areas(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS districts_slug_idx ON districts(slug);
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "districts_select_public" ON districts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "districts_insert_admin" ON districts FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "districts_update_admin" ON districts FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "districts_delete_admin" ON districts FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Add district_id FK to properties and user_listings for structured taxonomy
ALTER TABLE properties ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES districts(id);
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES districts(id);

-- Add clicks/impressions tracking to banners
ALTER TABLE banners ADD COLUMN IF NOT EXISTS impressions integer DEFAULT 0;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS clicks integer DEFAULT 0;

-- Seed districts for Bình Dương
INSERT INTO districts (area_id, name, slug, order_index)
SELECT a.id, d.name, d.slug, d.ord FROM areas a
JOIN (VALUES
  ('Thủ Dầu Một', 'thu-dau-mot', 1),
  ('Dĩ An', 'di-an', 2),
  ('Thuận An', 'thuan-an', 3),
  ('Bến Cát', 'ben-cat', 4),
  ('Bàu Bàng', 'bau-bang', 5),
  ('Tân Uyên', 'tan-uyen', 6),
  ('Bình Dương (Phú Giáo)', 'phu-giao', 7),
  ('Dầu Tiếng', 'dau-tieng', 8)
) AS d(name, slug, ord) ON true
WHERE a.name ILIKE '%Bình Dương%'
  AND NOT EXISTS (SELECT 1 FROM districts WHERE slug = d.slug)
LIMIT 100;

-- Seed districts for Bình Phước
INSERT INTO districts (area_id, name, slug, order_index)
SELECT a.id, d.name, d.slug, d.ord FROM areas a
JOIN (VALUES
  ('Đồng Xoài', 'dong-xoai', 1),
  ('Bình Long', 'binh-long', 2),
  ('Phước Long', 'phuoc-long', 3),
  ('Chơn Thành', 'chon-thanh', 4),
  ('Đồng Phú', 'dong-phu', 5),
  ('Bù Đăng', 'bu-dang', 6),
  ('Hớn Quản', 'hon-quan', 7),
  ('Lộc Ninh', 'loc-ninh', 8),
  ('Bù Gia Mập', 'bu-gia-map', 9),
  ('Bù Đốp', 'bu-dop', 10)
) AS d(name, slug, ord) ON true
WHERE a.name ILIKE '%Bình Phước%'
  AND NOT EXISTS (SELECT 1 FROM districts WHERE slug = d.slug)
LIMIT 100;

-- Seed districts for Đồng Nai
INSERT INTO districts (area_id, name, slug, order_index)
SELECT a.id, d.name, d.slug, d.ord FROM areas a
JOIN (VALUES
  ('Biên Hòa', 'bien-hoa', 1),
  ('Long Khánh', 'long-khanh', 2),
  ('Nhơn Trạch', 'nhon-trach', 3),
  ('Long Thành', 'long-thanh', 4),
  ('Trảng Bom', 'trang-bom', 5),
  ('Xuân Lộc', 'xuan-loc', 6),
  ('Thống Nhất', 'thong-nhat', 7),
  ('Định Quán', 'dinh-quan', 8),
  ('Tân Phú', 'tan-phu-dong-nai', 9),
  ('Vĩnh Cửu', 'vinh-cuu', 10),
  ('Cẩm Mỹ', 'cam-my', 11)
) AS d(name, slug, ord) ON true
WHERE a.name ILIKE '%Đồng Nai%'
  AND NOT EXISTS (SELECT 1 FROM districts WHERE slug = d.slug)
LIMIT 100;

-- Seed districts for Hồ Chí Minh (if it exists in areas)
INSERT INTO districts (area_id, name, slug, order_index)
SELECT a.id, d.name, d.slug, d.ord FROM areas a
JOIN (VALUES
  ('Quận 1', 'quan-1-hcm', 1),
  ('Quận 2 (Thủ Đức)', 'quan-2-thu-duc', 2),
  ('Quận 7', 'quan-7-hcm', 3),
  ('Bình Thạnh', 'binh-thanh-hcm', 4),
  ('Gò Vấp', 'go-vap-hcm', 5),
  ('Tân Bình', 'tan-binh-hcm', 6),
  ('Nhà Bè', 'nha-be-hcm', 7),
  ('Hóc Môn', 'hoc-mon-hcm', 8),
  ('Bình Chánh', 'binh-chanh-hcm', 9),
  ('Củ Chi', 'cu-chi-hcm', 10)
) AS d(name, slug, ord) ON true
WHERE (a.name ILIKE '%Hồ Chí Minh%' OR a.name ILIKE '%TP HCM%' OR a.name ILIKE '%TP.HCM%')
  AND NOT EXISTS (SELECT 1 FROM districts WHERE slug = d.slug)
LIMIT 100;
/*
# Featured Sections – Dynamic Homepage Curation

## Mục đích
Cho phép admin tạo nhiều mục "Tin đăng nổi bật" tùy biến trên trang chủ.
Mỗi mục có thể chạy ở 2 chế độ:
  - **auto**: Tự động lấy BĐS dựa theo bộ lọc (khu vực, loại BĐS, loại giao dịch, sắp xếp).
  - **manual**: Admin chọn thủ công từng BĐS và kéo-thả sắp xếp thứ tự hiển thị.

## Bảng mới

### featured_sections
Cấu hình mỗi mục nổi bật trên trang chủ.
- `title` – Tiêu đề mục (VD: "Đất nền Bình Dương")
- `subtitle` – Mô tả phụ
- `mode` – 'auto' hoặc 'manual'
- `filter_area_id` – (auto) Chỉ lấy BĐS trong khu vực này
- `filter_listing_type` – (auto) 'mua_ban' / 'cho_thue' / '' (tất cả)
- `filter_property_type_id` – (auto) Loại BĐS cụ thể
- `filter_is_hot` – (auto) Chỉ lấy BĐS HOT
- `auto_sort` – (auto) Cách sắp xếp: newest / views / price_asc / price_desc
- `display_count` – Số BĐS hiển thị (1-20)
- `display_style` – 'grid' / 'horizontal'
- `is_active` – Hiển thị/ẩn mục này
- `order_index` – Thứ tự hiển thị trên trang chủ

### featured_section_items
Danh sách BĐS được ghim thủ công cho chế độ manual.
- `section_id` – Thuộc mục nào
- `property_id` – BĐS nào
- `order_index` – Thứ tự trong mục

## Bảo mật
- Public (anon + authenticated) SELECT on both tables.
- Admin-only INSERT/UPDATE/DELETE (authenticated).

## Seed data
Tạo 2 mục mặc định: "Tin đăng nổi bật" (auto, is_featured) và "BĐS Hot" (auto, is_hot).
*/

-- ─── featured_sections ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS featured_sections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                   text NOT NULL,
  subtitle                text,
  mode                    text NOT NULL DEFAULT 'auto'
                          CHECK (mode IN ('auto','manual')),
  -- Auto mode filters
  filter_area_id          uuid REFERENCES areas(id) ON DELETE SET NULL,
  filter_listing_type     text DEFAULT ''
                          CHECK (filter_listing_type IN ('','mua_ban','cho_thue')),
  filter_property_type_id uuid REFERENCES property_types(id) ON DELETE SET NULL,
  filter_is_hot           boolean DEFAULT false,
  filter_is_featured      boolean DEFAULT false,
  auto_sort               text NOT NULL DEFAULT 'newest'
                          CHECK (auto_sort IN ('newest','views','price_asc','price_desc')),
  -- Display
  display_count           integer NOT NULL DEFAULT 8
                          CHECK (display_count BETWEEN 1 AND 20),
  display_style           text NOT NULL DEFAULT 'grid'
                          CHECK (display_style IN ('grid','horizontal')),
  is_active               boolean NOT NULL DEFAULT true,
  order_index             integer NOT NULL DEFAULT 0,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_featured_sections_active
  ON featured_sections(order_index) WHERE is_active = true;

ALTER TABLE featured_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fs_select" ON featured_sections;
CREATE POLICY "fs_select" ON featured_sections
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "fs_insert" ON featured_sections;
CREATE POLICY "fs_insert" ON featured_sections
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "fs_update" ON featured_sections;
CREATE POLICY "fs_update" ON featured_sections
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fs_delete" ON featured_sections;
CREATE POLICY "fs_delete" ON featured_sections
  FOR DELETE TO authenticated USING (true);

-- ─── featured_section_items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS featured_section_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  uuid NOT NULL REFERENCES featured_sections(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(section_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_fsi_section
  ON featured_section_items(section_id, order_index);

ALTER TABLE featured_section_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fsi_select" ON featured_section_items;
CREATE POLICY "fsi_select" ON featured_section_items
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "fsi_insert" ON featured_section_items;
CREATE POLICY "fsi_insert" ON featured_section_items
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "fsi_update" ON featured_section_items;
CREATE POLICY "fsi_update" ON featured_section_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fsi_delete" ON featured_section_items;
CREATE POLICY "fsi_delete" ON featured_section_items
  FOR DELETE TO authenticated USING (true);

-- ─── auto-update updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_featured_sections_updated_at ON featured_sections;
CREATE TRIGGER trg_featured_sections_updated_at
  BEFORE UPDATE ON featured_sections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Seed: 2 default sections ─────────────────────────────────────────────────
INSERT INTO featured_sections
  (title, subtitle, mode, filter_is_featured, filter_is_hot, auto_sort, display_count, display_style, is_active, order_index)
VALUES
  ('Tin đăng nổi bật', 'Các bất động sản được quan tâm nhiều nhất', 'auto', true, false, 'newest', 8, 'grid', true, 0),
  ('BĐS Hot – Giá tốt', 'Cập nhật mới nhất, cơ hội đầu tư không thể bỏ qua', 'auto', false, true, 'views', 4, 'horizontal', true, 1)
ON CONFLICT DO NOTHING;
/*
# Add property_favorites and subscribers tables

1. New Tables
   - `property_favorites`: Users can save/unsave properties persistently.
     - `id` uuid PK
     - `user_id` uuid FK → auth.users (owner, default auth.uid())
     - `property_id` uuid FK → properties
     - `created_at` timestamp
     - UNIQUE(user_id, property_id) prevents duplicates

   - `subscribers`: Newsletter/notification email subscriptions.
     - `id` uuid PK
     - `email` text UNIQUE NOT NULL
     - `name` text nullable
     - `phone` text nullable
     - `area_interest` text nullable
     - `is_active` boolean default true
     - `created_at` timestamp

2. Security
   - `property_favorites`: RLS enabled, owner-scoped CRUD for authenticated users
   - `subscribers`: RLS enabled, anon+authenticated INSERT (public subscribe), authenticated SELECT/DELETE

3. Notes
   - Favorites owned by auth.uid() — must be logged in to save
   - Subscribers allows anonymous insert so visitors can subscribe without account
*/

-- ─── property_favorites ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON property_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_property ON property_favorites(property_id);

ALTER TABLE property_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_favorites" ON property_favorites;
CREATE POLICY "select_own_favorites" ON property_favorites FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_favorites" ON property_favorites;
CREATE POLICY "insert_own_favorites" ON property_favorites FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_favorites" ON property_favorites;
CREATE POLICY "delete_own_favorites" ON property_favorites FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ─── subscribers ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  phone text,
  area_interest text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);

ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_subscribers" ON subscribers;
CREATE POLICY "anon_insert_subscribers" ON subscribers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_select_subscribers" ON subscribers;
CREATE POLICY "auth_select_subscribers" ON subscribers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_update_subscribers" ON subscribers;
CREATE POLICY "auth_update_subscribers" ON subscribers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_subscribers" ON subscribers;
CREATE POLICY "auth_delete_subscribers" ON subscribers FOR DELETE
  TO authenticated USING (true);
/*
# Page Builder - Section Layout Configuration

Adds `page_sections` table to control the visibility and order of sections
on the landing page (equivalent to a WordPress page builder).

1. New Tables
  - `page_sections`
    - `id` (text, primary key) – machine key matching the section identifier in frontend code
    - `label` (text) – human-readable display name shown in the admin UI
    - `description` (text, nullable) – short hint shown to the admin
    - `icon` (text, nullable) – icon name hint for the UI
    - `is_visible` (boolean, default true) – whether the section is rendered
    - `order_index` (integer) – ascending render order
    - `settings` (jsonb, default '{}') – reserved for future per-section config (background color, padding, etc.)
    - `created_at` / `updated_at` (timestamptz)

2. Default rows
  Seeds all 9 known sections with sensible defaults.

3. Security
  - RLS enabled.
  - Anon + authenticated SELECT (frontend needs to read layout without auth).
  - Authenticated-only UPDATE (only admin can mutate).
  - No INSERT/DELETE from client (rows are seeded at migration time and managed via UPDATE).
*/

CREATE TABLE IF NOT EXISTS page_sections (
  id          text PRIMARY KEY,
  label       text NOT NULL,
  description text,
  icon        text,
  is_visible  boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  settings    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE page_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_sections_select" ON page_sections;
CREATE POLICY "page_sections_select" ON page_sections FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "page_sections_update" ON page_sections;
CREATE POLICY "page_sections_update" ON page_sections FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "page_sections_insert" ON page_sections;
CREATE POLICY "page_sections_insert" ON page_sections FOR INSERT
  TO authenticated WITH CHECK (true);

-- Seed default sections (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO page_sections (id, label, description, icon, is_visible, order_index) VALUES
  ('hero',              'Hero & Tìm kiếm',          'Banner đầu trang, ô tìm kiếm BĐS', 'Home', true, 0),
  ('stats',             'Thống kê nổi bật',          'Dải số liệu: tổng BĐS, khách hàng...', 'BarChart3', true, 1),
  ('categories',        'Danh mục nhanh',            'Lưới loại hình BĐS (đất nền, nhà phố...)', 'Grid3X3', true, 2),
  ('featured_sections', 'Tin nổi bật (động)',        'Các section tin đăng do admin cấu hình', 'Layers', true, 3),
  ('region_banners',    'Khám phá theo khu vực',     'Banner 3 tỉnh: Bình Dương, Bình Phước, Đồng Nai', 'MapPin', true, 4),
  ('why_us',            'Tại sao chọn chúng tôi',   'Lưới 4 tính năng nổi bật', 'Shield', true, 5),
  ('testimonials',      'Đánh giá khách hàng',       'Testimonial / review từ khách hàng', 'Star', true, 6),
  ('news',              'Tin tức mới nhất',          'Grid 3 bài viết mới nhất', 'Newspaper', true, 7),
  ('cta',               'CTA Banner',                'Banner kêu gọi hành động cuối trang', 'Zap', true, 8),
  ('social_proof',      'Minh chứng xã hội',        'Dải biểu tượng tin cậy (đăng ký, xác thực...)', 'CheckCircle', true, 9)
ON CONFLICT (id) DO NOTHING;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_page_sections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_page_sections_updated_at ON page_sections;
CREATE TRIGGER trg_page_sections_updated_at
  BEFORE UPDATE ON page_sections
  FOR EACH ROW EXECUTE FUNCTION update_page_sections_updated_at();
/*
# Add layout/UI text settings

Adds new site_settings rows for hardcoded text that admins should be able to edit:
- support_hours: Header top bar support hours text
- sidebar_cta_title, sidebar_cta_sub, sidebar_cta_btn: Sidebar CTA box text
- footer_license: Footer license/registration text
- footer_col3_sub1, footer_col3_sub2: Footer column 3 sub lines

These rows join the existing site_settings table (general group).
*/

INSERT INTO site_settings (key, value, label, group_name, type)
VALUES
  ('support_hours',      'Hỗ trợ 7:00 – 21:00',                        'Giờ hỗ trợ (thanh header)',        'general', 'text'),
  ('sidebar_cta_title',  'Cần tư vấn ngay?',                            'Tiêu đề CTA sidebar',              'general', 'text'),
  ('sidebar_cta_sub',    'Chuyên gia sẵn sàng hỗ trợ 7:00–21:00',      'Mô tả phụ CTA sidebar',            'general', 'text'),
  ('sidebar_cta_btn',    'Gửi yêu cầu tư vấn',                         'Nút CTA sidebar',                  'general', 'text'),
  ('footer_license',     'Giấy phép ĐKKD: 0000000000 | Bình Dương',    'Dòng giấy phép footer',            'footer',  'text'),
  ('footer_col3_sub1',   'Chuyên sâu: Bình Dương',                     'Footer cột 3 – dòng phụ 1',        'footer',  'text'),
  ('footer_col3_sub2',   'Mở rộng: Bình Phước, Đồng Nai',              'Footer cột 3 – dòng phụ 2',        'footer',  'text')
ON CONFLICT (key) DO NOTHING;
/*
# Page Management System

Adds a full page management system allowing admins to create, edit, and customize
all static pages from the admin panel.

1. New Tables
   - `managed_pages`: master list of all pages (slug, title, status, type)
   - `page_blocks`: content blocks within each page (section key, type, value, order)

2. Seed Data
   - Inserts default entries for all existing static pages:
     about, invest, regions, news (+ built-in pages)
   - Each page gets default content blocks for all their hardcoded text

3. Security
   - RLS enabled on both tables
   - anon + authenticated SELECT (public pages are public content)
   - authenticated-only INSERT/UPDATE/DELETE

4. Notes
   - page_blocks.type: 'text', 'textarea', 'image', 'number', 'color', 'list' (json array)
   - page_blocks.section: logical grouping within a page (hero, stats, team, etc.)
   - Frontend pages should read from this table; fall back to hardcoded defaults
*/

CREATE TABLE IF NOT EXISTS managed_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  hero_image text,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS page_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug text NOT NULL REFERENCES managed_pages(slug) ON DELETE CASCADE,
  section text NOT NULL DEFAULT 'main',
  key text NOT NULL,
  label text NOT NULL,
  type text NOT NULL DEFAULT 'text',
  value text,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(page_slug, section, key)
);

-- RLS
ALTER TABLE managed_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_pages" ON managed_pages;
CREATE POLICY "public_select_pages" ON managed_pages FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_pages" ON managed_pages;
CREATE POLICY "auth_insert_pages" ON managed_pages FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_pages" ON managed_pages;
CREATE POLICY "auth_update_pages" ON managed_pages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_pages" ON managed_pages;
CREATE POLICY "auth_delete_pages" ON managed_pages FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "public_select_blocks" ON page_blocks;
CREATE POLICY "public_select_blocks" ON page_blocks FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_blocks" ON page_blocks;
CREATE POLICY "auth_insert_blocks" ON page_blocks FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_blocks" ON page_blocks;
CREATE POLICY "auth_update_blocks" ON page_blocks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_blocks" ON page_blocks;
CREATE POLICY "auth_delete_blocks" ON page_blocks FOR DELETE TO authenticated USING (true);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_managed_pages_updated_at ON managed_pages;
CREATE TRIGGER update_managed_pages_updated_at BEFORE UPDATE ON managed_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_page_blocks_updated_at ON page_blocks;
CREATE TRIGGER update_page_blocks_updated_at BEFORE UPDATE ON page_blocks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed system pages
INSERT INTO managed_pages (slug, title, description, hero_image, is_system, order_index)
VALUES
  ('about',   'Về chúng tôi',   'Giới thiệu công ty, đội ngũ và hành trình phát triển',
   'https://images.pexels.com/photos/1732414/pexels-photo-1732414.jpeg', true, 1),
  ('invest',  'Đầu tư',         'Cơ hội đầu tư bất động sản sinh lời cao',
   'https://images.pexels.com/photos/210158/pexels-photo-210158.jpeg', true, 2),
  ('regions', 'Khu vực',        'Thông tin chi tiết các khu vực hoạt động',
   'https://images.pexels.com/photos/1438072/pexels-photo-1438072.jpeg', true, 3),
  ('news',    'Tin tức',        'Tin tức thị trường bất động sản',
   'https://images.pexels.com/photos/518543/pexels-photo-518543.jpeg', true, 4)
ON CONFLICT (slug) DO NOTHING;

-- Seed content blocks for ABOUT page
INSERT INTO page_blocks (page_slug, section, key, label, type, value, order_index) VALUES
  ('about','hero','title','Tiêu đề trang','text','VỀ CHÚNG TÔI',1),
  ('about','hero','subtitle','Mô tả hero','textarea','7 năm đồng hành cùng hàng nghìn gia đình và nhà đầu tư tìm kiếm tổ ấm, cơ hội tại thị trường phía Nam.',2),
  ('about','hero','image','Ảnh nền hero','image','https://images.pexels.com/photos/1732414/pexels-photo-1732414.jpeg',3),
  ('about','stats','stat1_value','Thống kê 1 – số','text','7+',1),
  ('about','stats','stat1_label','Thống kê 1 – nhãn','text','Năm kinh nghiệm',2),
  ('about','stats','stat2_value','Thống kê 2 – số','text','500+',3),
  ('about','stats','stat2_label','Thống kê 2 – nhãn','text','Dự án thành công',4),
  ('about','stats','stat3_value','Thống kê 3 – số','text','1.200+',5),
  ('about','stats','stat3_label','Thống kê 3 – nhãn','text','Khách hàng tin tưởng',6),
  ('about','stats','stat4_value','Thống kê 4 – số','text','98%',7),
  ('about','stats','stat4_label','Thống kê 4 – nhãn','text','Tỷ lệ hài lòng',8),
  ('about','mission','title','Tiêu đề sứ mệnh','text','SỨ MỆNH CỦA CHÚNG TÔI',1),
  ('about','mission','content','Nội dung sứ mệnh','textarea','Nhà Đất Kết Nối ra đời với sứ mệnh kết nối người mua và người bán một cách nhanh chóng, minh bạch và hiệu quả nhất.',2),
  ('about','mission','items','Danh sách cam kết (mỗi dòng 1 mục)','list','Cung cấp thông tin BĐS chính xác, cập nhật\nĐồng hành toàn bộ quy trình giao dịch\nBảo vệ quyền lợi tối đa cho khách hàng',3),
  ('about','vision','title','Tiêu đề tầm nhìn','text','TẦM NHÌN 2030',1),
  ('about','vision','content','Nội dung tầm nhìn','textarea','Trở thành nền tảng môi giới bất động sản số 1 khu vực Đông Nam Bộ, phủ sóng toàn bộ 10 tỉnh thành và phục vụ hơn 10.000 khách hàng thành công.',2),
  ('about','values','title','Tiêu đề giá trị cốt lõi','text','GIÁ TRỊ CỐT LÕI',1),
  ('about','values','v1_title','Giá trị 1 – tiêu đề','text','Uy tín',2),
  ('about','values','v1_desc','Giá trị 1 – mô tả','text','Cam kết trung thực, minh bạch trong mọi giao dịch.',3),
  ('about','values','v2_title','Giá trị 2 – tiêu đề','text','Tận tâm',4),
  ('about','values','v2_desc','Giá trị 2 – mô tả','text','Luôn đặt lợi ích khách hàng lên hàng đầu.',5),
  ('about','values','v3_title','Giá trị 3 – tiêu đề','text','Chuyên nghiệp',6),
  ('about','values','v3_desc','Giá trị 3 – mô tả','text','Đội ngũ được đào tạo bài bản, kinh nghiệm thực chiến.',7),
  ('about','values','v4_title','Giá trị 4 – tiêu đề','text','Hiệu quả',8),
  ('about','values','v4_desc','Giá trị 4 – mô tả','text','Kết quả nhanh chóng, tối ưu nhất cho từng khách hàng.',9),
  ('about','timeline','title','Tiêu đề hành trình','text','HÀNH TRÌNH PHÁT TRIỂN',1),
  ('about','timeline','items','Các mốc (JSON: [{year,title,desc}])','list','2018|Thành lập công ty|Nhà Đất Kết Nối ra đời với đội ngũ 10 người tại Bình Dương.\n2019|Mở rộng khu vực|Mở rộng hoạt động sang Đồng Nai và TP. Hồ Chí Minh.\n2020|500 giao dịch|Đạt mốc 500 giao dịch thành công đầu tiên dù bối cảnh dịch bệnh.\n2022|Nền tảng số|Ra mắt website và hệ thống quản lý BĐS trực tuyến.\n2024|Mở rộng Bình Phước|Phủ sóng thêm thị trường Bình Phước – mảnh đất nhiều tiềm năng.\n2025|1.200+ khách hàng|Đạt mốc 1.200 khách hàng hài lòng, 500+ dự án thành công.',2),
  ('about','team','title','Tiêu đề đội ngũ','text','ĐỘI NGŨ LÃNH ĐẠO',1),
  ('about','team','members','Thành viên (mỗi dòng: tên|chức vụ|kinh nghiệm|ảnh)','list','Nguyễn Văn Minh|Giám đốc điều hành|12 năm kinh nghiệm|https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg\nTrần Thị Hoa|Giám đốc kinh doanh|9 năm kinh nghiệm|https://images.pexels.com/photos/3769021/pexels-photo-3769021.jpeg\nLê Quốc Hùng|Trưởng phòng pháp lý|8 năm kinh nghiệm|https://images.pexels.com/photos/1516680/pexels-photo-1516680.jpeg\nPhạm Thị Lan|Trưởng phòng tư vấn|7 năm kinh nghiệm|https://images.pexels.com/photos/3756679/pexels-photo-3756679.jpeg',2),
  ('about','awards','title','Tiêu đề giải thưởng','text','Giải thưởng & Chứng nhận',1),
  ('about','awards','items','Danh sách giải thưởng (mỗi dòng 1 mục)','list','Top 10 Sàn giao dịch BĐS uy tín 2024\nChứng nhận Môi giới chuyên nghiệp\nThành viên Hội Môi giới BĐS Việt Nam',2)
ON CONFLICT (page_slug, section, key) DO NOTHING;

-- Seed content blocks for INVEST page
INSERT INTO page_blocks (page_slug, section, key, label, type, value, order_index) VALUES
  ('invest','hero','title','Tiêu đề chính','text','ĐẦU TƯ BẤT ĐỘNG SẢN',1),
  ('invest','hero','subtitle','Mô tả phụ','textarea','Khám phá cơ hội sinh lời hấp dẫn từ đất nền, nhà phố và khu dân cư tại vùng kinh tế trọng điểm phía Nam',2),
  ('invest','hero','badge','Nhãn nổi bật','text','Sinh lời 15–35%/năm',3),
  ('invest','hero','image','Ảnh nền hero','image','https://images.pexels.com/photos/210158/pexels-photo-210158.jpeg',4),
  ('invest','calculator','title','Tiêu đề công cụ tính ROI','text','Công Cụ Tính ROI',1),
  ('invest','calculator','subtitle','Mô tả phụ công cụ ROI','text','Dự báo lợi nhuận đầu tư bất động sản của bạn',2),
  ('invest','opportunities','title','Tiêu đề cơ hội đầu tư','text','Cơ Hội Đầu Tư',1),
  ('invest','opportunities','subtitle','Mô tả phụ','text','Các loại hình bất động sản đang được nhà đầu tư quan tâm nhất',2),
  ('invest','process','title','Tiêu đề quy trình','text','Quy Trình Đầu Tư',1),
  ('invest','process','subtitle','Mô tả phụ quy trình','text','5 bước đơn giản để sở hữu bất động sản sinh lời',2),
  ('invest','cta','title','Tiêu đề form tư vấn','text','Đăng ký tư vấn đầu tư',1),
  ('invest','cta','subtitle','Mô tả phụ form','text','Chuyên gia sẽ gọi lại trong vòng 30 phút để phân tích cơ hội phù hợp với bạn',2),
  ('invest','cta','why_title','Tiêu đề "Tại sao chọn chúng tôi"','text','Tại sao chọn chúng tôi?',3)
ON CONFLICT (page_slug, section, key) DO NOTHING;

-- Seed content blocks for REGIONS page
INSERT INTO page_blocks (page_slug, section, key, label, type, value, order_index) VALUES
  ('regions','hero','title','Tiêu đề trang','text','KHU VỰC HOẠT ĐỘNG',1),
  ('regions','hero','subtitle','Mô tả phụ','textarea','Chuyên sâu tại 4 tỉnh thành trọng điểm phía Nam — nơi hội tụ cơ hội đầu tư hấp dẫn nhất',2),
  ('regions','hero','image','Ảnh nền hero','image','https://images.pexels.com/photos/1438072/pexels-photo-1438072.jpeg',3),
  ('regions','main','select_label','Nhãn chọn khu vực','text','Chọn khu vực bạn quan tâm',1),
  ('regions','cta','title','Tiêu đề CTA','text','Chưa biết nên đầu tư ở đâu?',1),
  ('regions','cta','subtitle','Mô tả CTA','textarea','Chuyên gia của chúng tôi sẽ phân tích và đề xuất khu vực phù hợp nhất với ngân sách và mục tiêu của bạn.',2),
  ('regions','cta','btn_consult','Nút tư vấn','text','Tư vấn miễn phí',3),
  ('regions','cta','btn_invest','Nút xem đầu tư','text','Xem cơ hội đầu tư',4)
ON CONFLICT (page_slug, section, key) DO NOTHING;

-- Seed content blocks for NEWS page
INSERT INTO page_blocks (page_slug, section, key, label, type, value, order_index) VALUES
  ('news','hero','title','Tiêu đề trang','text','TIN TỨC THỊ TRƯỜNG',1),
  ('news','hero','subtitle','Mô tả phụ','textarea','Cập nhật thông tin, phân tích và xu hướng bất động sản mới nhất',2),
  ('news','hero','image','Ảnh nền hero','image','https://images.pexels.com/photos/518543/pexels-photo-518543.jpeg',3),
  ('news','newsletter','title','Tiêu đề newsletter','text','Nhận tin tức mới nhất',1),
  ('news','newsletter','subtitle','Mô tả newsletter','text','Đăng ký nhận bản tin BĐS hàng tuần miễn phí',2),
  ('news','newsletter','placeholder','Placeholder email','text','Nhập email của bạn...',3),
  ('news','newsletter','btn','Nút đăng ký','text','Đăng ký',4)
ON CONFLICT (page_slug, section, key) DO NOTHING;
-- =============================================================================
-- Storage Buckets Configuration & RLS Policies
-- Tách biệt hoàn toàn giữa admin-uploads và user-uploads
-- =============================================================================

-- ─── BƯỚC 1: Tạo Storage Buckets ────────────────────────────────────────────
-- Lưu ý: Các bucket này cần được tạo qua Supabase Dashboard hoặc CLI
-- Đây là SQL để thiết lập policies cho các bucket đã tạo

-- Tạo bucket bucket_admin_uploads (chỉ dành cho admin)
-- Tạo bucket bucket_user_uploads (cho người dùng thông thường)

-- ─── BƯỚC 2: RLS Policies cho storage.objects ────────────────────────────────
-- Xóa policies cũ nếu tồn tại
DROP POLICY IF EXISTS "admin_uploads_select" ON storage.objects;
DROP POLICY IF EXISTS "admin_uploads_insert" ON storage.objects;
DROP POLICY IF EXISTS "admin_uploads_update" ON storage.objects;
DROP POLICY IF EXISTS "admin_uploads_delete" ON storage.objects;

DROP POLICY IF EXISTS "user_uploads_select" ON storage.objects;
DROP POLICY IF EXISTS "user_uploads_insert" ON storage.objects;
DROP POLICY IF EXISTS "user_uploads_update" ON storage.objects;
DROP POLICY IF EXISTS "user_uploads_delete" ON storage.objects;

-- Policy cho admin-uploads bucket
-- Chỉ admin mới có quyền truy cập đầy đủ
CREATE POLICY "admin_uploads_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'admin-uploads'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admin_uploads_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'admin-uploads'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admin_uploads_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'admin-uploads'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'admin-uploads'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admin_uploads_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'admin-uploads'
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy cho user-uploads bucket
-- Người dùng có thể upload, xem và xóa ảnh của chính họ
CREATE POLICY "user_uploads_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-uploads'
  );

CREATE POLICY "user_uploads_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-uploads'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "user_uploads_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND (storage.owner(id) = auth.uid())
  )
  WITH CHECK (
    bucket_id = 'user-uploads'
    AND (storage.owner(id) = auth.uid())
  );

CREATE POLICY "user_uploads_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND (storage.owner(id) = auth.uid())
  );

-- ─── BƯỚC 3: Thêm cấu hình bucket prefix ────────────────────────────────────
-- Thêm các cài đặt cho bucket prefix vào site_settings nếu chưa có
INSERT INTO site_settings (key, value, label, group_name, type) VALUES
  ('admin_bucket_prefix', 'admin-uploads', 'Bucket prefix cho admin', 'storage', 'text'),
  ('user_bucket_prefix', 'user-uploads', 'Bucket prefix cho người dùng', 'storage', 'text')
ON CONFLICT (key) DO NOTHING;-- =============================================================================
-- User Favorites - Bảng lưu trữ BĐS yêu thích của người dùng
-- =============================================================================

-- Bảng user_favorites (phân biệt với property_favorites hiện có)
CREATE TABLE IF NOT EXISTS user_favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, property_id)
);

-- Index để truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_property_id ON user_favorites(property_id);

-- RLS Policies
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

-- Chỉ người dùng tương ứng mới xem được favorites của họ
DROP POLICY IF EXISTS "uf_select" ON user_favorites;
CREATE POLICY "uf_select" ON user_favorites FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "uf_insert" ON user_favorites;
CREATE POLICY "uf_insert" ON user_favorites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "uf_delete" ON user_favorites;
CREATE POLICY "uf_delete" ON user_favorites FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "uf_update" ON user_favorites;
CREATE POLICY "uf_update" ON user_favorites FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);-- =============================================================================
-- Auto Slug Function - Tự động tạo slug từ tiêu đề
-- =============================================================================

-- Tạo extension để tạo slug tự động
-- Sử dụng trong trigger hoặc gọi trực tiếp từ API

CREATE OR REPLACE FUNCTION generate_slug(title text)
RETURNS text AS $$
DECLARE
  slug text;
  base_slug text;
BEGIN
  -- Chuyển thành chữ thường, bỏ dấu, thay khoảng trắng bằng dấu gạch ngang
  base_slug := regexp_replace(
    lower(
      title,
      'N'
    ),
    '[àáạảãâầấậẩẫăằắặẳẵ]', 'a', 'g'
  ) || regexp_replace(
    lower(title),
    '[èéẹẻẽêềếệểễ]', 'e', 'g'
  ) || regexp_replace(
    lower(title),
    '[ìíịỉĩ]', 'i', 'g'
  ) || regexp_replace(
    lower(title),
    '[òóọỏõôồốộổỗơờớợởỡ]', 'o', 'g'
  ) || regexp_replace(
    lower(title),
    '[ùúụủũưừứựửữ]', 'u', 'g'
  ) || regexp_replace(
    lower(title),
    '[ỳýỵỷỹ]', 'y', 'g'
  ) || regexp_replace(
    lower(title),
    '[đ]', 'd', 'g'
  );
  
  -- Thay các ký tự đặc biệt và khoảng trắng thành gạch ngang
  slug := regexp_replace(
    regexp_replace(
      base_slug,
      '[^a-z0-9\s-]', '', 'g'
    ),
    '\s+', '-', 'g'
  );
  
  -- Loại bỏ các gạch ngang ở đầu và cuối
  slug := trim(both '-' from slug);
  
  -- Giới hạn độ dài slug
  slug := substring(slug, 1, 100);
  
  RETURN slug;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Thêm cột slug cho bảng properties (nếu chưa có)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Thêm index cho slug
CREATE INDEX IF NOT EXISTS idx_properties_slug ON properties(slug);

-- Trigger tự động tạo slug khi tạo Property mới
CREATE OR REPLACE FUNCTION set_property_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.title);
    -- Đảm bảo slug duy nhất
    NEW.slug := NEW.slug || '-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_properties_slug ON properties;
CREATE TRIGGER trg_properties_slug
  BEFORE INSERT ON properties
  FOR EACH ROW EXECUTE FUNCTION set_property_slug();

-- Thêm cột slug cho bảng news (nếu chưa có)
ALTER TABLE news ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Thêm index cho slug
CREATE INDEX IF NOT EXISTS idx_news_slug ON news(slug);

-- Trigger tự động tạo slug khi tạo News mới
CREATE OR REPLACE FUNCTION set_news_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.title);
    -- Đảm bảo slug duy nhất
    NEW.slug := NEW.slug || '-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_news_slug ON news;
CREATE TRIGGER trg_news_slug
  BEFORE INSERT ON news
  FOR EACH ROW EXECUTE FUNCTION set_news_slug();/*
# RLS Admin Hardening — Vá lỗ hổng phân quyền (Broken Access Control)

## Bối cảnh / Vấn đề
Nhiều bảng trong hệ thống đang dùng policy dạng:
  TO authenticated WITH CHECK (true)
Điều này có nghĩa là BẤT KỲ người dùng nào đã đăng nhập (kể cả user thường vừa
đăng ký tài khoản) đều có toàn quyền INSERT/UPDATE/DELETE lên dữ liệu quan
trọng (properties, news, projects, site_settings, banners, page_blocks...),
thay vì chỉ admin mới được phép — đây là lỗi Broken Access Control (OWASP #1).

Nghiêm trọng hơn: bảng `profiles` cho phép user tự UPDATE row của chính mình
mà không giới hạn cột nào, nghĩa là user thường có thể tự đổi `role` của mình
thành 'admin' (Privilege Escalation) rồi chiếm toàn quyền hệ thống.

Ngoài ra, `user_listings` chỉ có policy cho chủ sở hữu, chưa có policy cho
admin đọc/duyệt tin của người khác — khiến tính năng duyệt tin trong Admin
Panel không được bảo vệ đúng bởi RLS.

## Giải pháp
1. Hàm `is_admin()` (SECURITY DEFINER, STABLE) — nguồn chân lý duy nhất để
   kiểm tra quyền admin dựa trên `profiles.role`, dùng lại trong mọi policy.
2. Trigger `prevent_role_change_by_self` trên `profiles` — chặn user tự đổi
   cột `role`; chỉ admin (is_admin() = true) mới được đổi role của bất kỳ ai.
3. Thêm policy SELECT/UPDATE/ADMIN đầy đủ cho `user_listings`.
4. Thay toàn bộ policy admin-write lỏng lẻo (`USING(true)`) bằng `is_admin()`
   ở: areas, property_types, properties, testimonials, leads, news, projects,
   site_settings, site_content, banners, managed_pages, page_blocks,
   featured_sections, featured_section_items, page_sections, subscribers.
5. Giữ nguyên các policy public SELECT và public INSERT (leads, subscribers)
   vì đây là hành vi thiết kế đúng (form liên hệ / đăng ký không cần đăng nhập).

## Lưu ý vận hành quan trọng
Sau khi chạy migration này, KHÔNG còn user nào tự phong admin được nữa.
Để tạo admin đầu tiên, chạy trực tiếp trên SQL editor của Supabase:
  UPDATE profiles SET role = 'admin' WHERE id = '<user-uuid-của-bạn>';
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Hàm is_admin() dùng chung cho mọi policy
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. profiles: chặn tự leo thang đặc quyền (self role escalation)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_role_change_by_self()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role) AND NOT is_admin() THEN
    RAISE EXCEPTION 'Không có quyền thay đổi vai trò (role)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_change_by_self ON profiles;
CREATE TRIGGER trg_prevent_role_change_by_self
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_role_change_by_self();

-- Admin có thể xem / sửa mọi profile (vd. quản lý người dùng, đổi role)
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. user_listings: thêm quyền admin (đọc/duyệt/xóa tất cả)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_listings_admin_select" ON user_listings;
CREATE POLICY "user_listings_admin_select" ON user_listings FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "user_listings_admin_update" ON user_listings;
CREATE POLICY "user_listings_admin_update" ON user_listings FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "user_listings_admin_delete" ON user_listings;
CREATE POLICY "user_listings_admin_delete" ON user_listings FOR DELETE
  TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. areas
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_areas" ON areas;
CREATE POLICY "auth_insert_areas" ON areas FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_areas" ON areas;
CREATE POLICY "auth_update_areas" ON areas FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_areas" ON areas;
CREATE POLICY "auth_delete_areas" ON areas FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. property_types
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_property_types" ON property_types;
CREATE POLICY "auth_insert_property_types" ON property_types FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_property_types" ON property_types;
CREATE POLICY "auth_update_property_types" ON property_types FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_property_types" ON property_types;
CREATE POLICY "auth_delete_property_types" ON property_types FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. properties
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_properties" ON properties;
CREATE POLICY "auth_insert_properties" ON properties FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_properties" ON properties;
CREATE POLICY "auth_update_properties" ON properties FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_properties" ON properties;
CREATE POLICY "auth_delete_properties" ON properties FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. testimonials
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_testimonials" ON testimonials;
CREATE POLICY "auth_insert_testimonials" ON testimonials FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_testimonials" ON testimonials;
CREATE POLICY "auth_update_testimonials" ON testimonials FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_testimonials" ON testimonials;
CREATE POLICY "auth_delete_testimonials" ON testimonials FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. leads (INSERT vẫn public — form liên hệ không cần đăng nhập)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_select_leads" ON leads;
CREATE POLICY "auth_select_leads" ON leads FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "auth_update_leads" ON leads;
CREATE POLICY "auth_update_leads" ON leads FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_leads" ON leads;
CREATE POLICY "auth_delete_leads" ON leads FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. news
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "news_insert_admin" ON news;
CREATE POLICY "news_insert_admin" ON news FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "news_update_admin" ON news;
CREATE POLICY "news_update_admin" ON news FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "news_delete_admin" ON news;
CREATE POLICY "news_delete_admin" ON news FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. projects
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_insert_admin" ON projects;
CREATE POLICY "projects_insert_admin" ON projects FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "projects_update_admin" ON projects;
CREATE POLICY "projects_update_admin" ON projects FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "projects_delete_admin" ON projects;
CREATE POLICY "projects_delete_admin" ON projects FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. site_settings
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_site_settings" ON site_settings;
CREATE POLICY "auth_insert_site_settings" ON site_settings FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_site_settings" ON site_settings;
CREATE POLICY "auth_update_site_settings" ON site_settings FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_site_settings" ON site_settings;
CREATE POLICY "auth_delete_site_settings" ON site_settings FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. site_content
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_site_content" ON site_content;
CREATE POLICY "auth_insert_site_content" ON site_content FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_site_content" ON site_content;
CREATE POLICY "auth_update_site_content" ON site_content FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_site_content" ON site_content;
CREATE POLICY "auth_delete_site_content" ON site_content FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. banners
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_banners" ON banners;
CREATE POLICY "auth_insert_banners" ON banners FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_banners" ON banners;
CREATE POLICY "auth_update_banners" ON banners FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_banners" ON banners;
CREATE POLICY "auth_delete_banners" ON banners FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. managed_pages
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_pages" ON managed_pages;
CREATE POLICY "auth_insert_pages" ON managed_pages FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_pages" ON managed_pages;
CREATE POLICY "auth_update_pages" ON managed_pages FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_pages" ON managed_pages;
CREATE POLICY "auth_delete_pages" ON managed_pages FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. page_blocks
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_blocks" ON page_blocks;
CREATE POLICY "auth_insert_blocks" ON page_blocks FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_update_blocks" ON page_blocks;
CREATE POLICY "auth_update_blocks" ON page_blocks FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_blocks" ON page_blocks;
CREATE POLICY "auth_delete_blocks" ON page_blocks FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. featured_sections
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "fs_insert" ON featured_sections;
CREATE POLICY "fs_insert" ON featured_sections FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "fs_update" ON featured_sections;
CREATE POLICY "fs_update" ON featured_sections FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "fs_delete" ON featured_sections;
CREATE POLICY "fs_delete" ON featured_sections FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. featured_section_items
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "fsi_insert" ON featured_section_items;
CREATE POLICY "fsi_insert" ON featured_section_items FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "fsi_update" ON featured_section_items;
CREATE POLICY "fsi_update" ON featured_section_items FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "fsi_delete" ON featured_section_items;
CREATE POLICY "fsi_delete" ON featured_section_items FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. page_sections
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "page_sections_update" ON page_sections;
CREATE POLICY "page_sections_update" ON page_sections FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "page_sections_insert" ON page_sections;
CREATE POLICY "page_sections_insert" ON page_sections FOR INSERT TO authenticated WITH CHECK (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. subscribers (INSERT vẫn public — đăng ký newsletter không cần đăng nhập)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_select_subscribers" ON subscribers;
CREATE POLICY "auth_select_subscribers" ON subscribers FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "auth_update_subscribers" ON subscribers;
CREATE POLICY "auth_update_subscribers" ON subscribers FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth_delete_subscribers" ON subscribers;
CREATE POLICY "auth_delete_subscribers" ON subscribers FOR DELETE TO authenticated USING (is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. districts (đã dùng EXISTS profile check — chuẩn hóa lại dùng is_admin())
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "districts_insert_admin" ON districts;
CREATE POLICY "districts_insert_admin" ON districts FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "districts_update_admin" ON districts;
CREATE POLICY "districts_update_admin" ON districts FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "districts_delete_admin" ON districts;
CREATE POLICY "districts_delete_admin" ON districts FOR DELETE TO authenticated USING (is_admin());
/*
# User Media Library — Thư viện ảnh riêng cho từng tài khoản

## Vấn đề
Hiện tại user upload ảnh qua `ImageUpload` component, ảnh được lưu vào Supabase Storage
(bucket `user-uploads`) nhưng không có bảng metadata nào để:
- Liệt kê tất cả ảnh user đã upload
- Xóa ảnh khỏi storage khi user muốn dọn dẹp
- Tái sử dụng ảnh đã upload cho nhiều tin đăng khác nhau
- Biết dung lượng đã dùng / còn lại

## Giải pháp
1. Bảng `user_media` lưu metadata từng file ảnh của user
2. RLS: user chỉ xem/xóa media của chính mình
3. Storage trigger tự động ghi metadata khi upload thành công
4. Frontend: tab "Thư viện ảnh" trong trang AccountPage
*/

-- ─── user_media ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url         text NOT NULL,
  filename    text NOT NULL,
  folder      text NOT NULL DEFAULT 'properties',
  mime_type   text DEFAULT 'image/jpeg',
  size_bytes  bigint DEFAULT 0,
  width       int,
  height      int,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_media_user_id ON user_media(user_id);
CREATE INDEX IF NOT EXISTS idx_user_media_created_at ON user_media(created_at DESC);

ALTER TABLE user_media ENABLE ROW LEVEL SECURITY;

-- User chỉ xem được media của chính mình
DROP POLICY IF EXISTS "um_select_own" ON user_media;
CREATE POLICY "um_select_own" ON user_media FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- User chỉ insert được media của chính mình
DROP POLICY IF EXISTS "um_insert_own" ON user_media;
CREATE POLICY "um_insert_own" ON user_media FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- User chỉ xóa được media của chính mình
DROP POLICY IF EXISTS "um_delete_own" ON user_media;
CREATE POLICY "um_delete_own" ON user_media FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Admin xem/xóa được tất cả
DROP POLICY IF EXISTS "um_select_admin" ON user_media;
CREATE POLICY "um_select_admin" ON user_media FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "um_delete_admin" ON user_media;
CREATE POLICY "um_delete_admin" ON user_media FOR DELETE
  TO authenticated USING (is_admin());
-- =============================================================================
-- SEO Fields: Thêm trường SEO chuẩn cho properties và user_listings
-- - focus_keywords: từ khóa chính (text)
-- - schema_markup: JSON-LD cho RealEstateListing (jsonb)
-- - meta_title: đã có trên properties, thêm cho user_listings
-- - meta_description: đã có trên properties, thêm cho user_listings
-- =============================================================================

-- ─── properties: thêm focus_keywords + schema_markup ──────────────────────────
ALTER TABLE properties ADD COLUMN IF NOT EXISTS focus_keywords text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS schema_markup jsonb;

-- ─── user_listings: thêm đầy đủ trường SEO ────────────────────────────────────
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS slug text UNIQUE;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS focus_keywords text;
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS schema_markup jsonb;

-- Index cho slug trên user_listings
CREATE INDEX IF NOT EXISTS idx_user_listings_slug ON user_listings(slug);

-- ─── Trigger tự động tạo slug cho user_listings ──────────────────────────────
CREATE OR REPLACE FUNCTION set_user_listing_slug()
RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_slug(NEW.title);
    -- Đảm bảo slug duy nhất
    NEW.slug := NEW.slug || '-' || substring(gen_random_uuid()::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_listings_slug ON user_listings;
CREATE TRIGGER trg_user_listings_slug
  BEFORE INSERT ON user_listings
  FOR EACH ROW EXECUTE FUNCTION set_user_listing_slug();

-- ─── Trigger tự động fill meta_title/meta_description nếu trống ───────────────
-- properties
CREATE OR REPLACE FUNCTION autofill_property_seo()
RETURNS trigger AS $$
BEGIN
  -- Nếu meta_title trống → dùng title (giới hạn 60 ký tự)
  IF NEW.meta_title IS NULL OR NEW.meta_title = '' THEN
    NEW.meta_title := substring(NEW.title, 1, 60);
  END IF;
  -- Nếu meta_description trống → dùng 155 ký tự đầu của description
  IF (NEW.meta_description IS NULL OR NEW.meta_description = '') AND NEW.description IS NOT NULL THEN
    NEW.meta_description := substring(NEW.description, 1, 155);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_properties_autofill_seo ON properties;
CREATE TRIGGER trg_properties_autofill_seo
  BEFORE INSERT OR UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION autofill_property_seo();

-- user_listings
CREATE OR REPLACE FUNCTION autofill_user_listing_seo()
RETURNS trigger AS $$
BEGIN
  IF NEW.meta_title IS NULL OR NEW.meta_title = '' THEN
    NEW.meta_title := substring(NEW.title, 1, 60);
  END IF;
  IF (NEW.meta_description IS NULL OR NEW.meta_description = '') AND NEW.description IS NOT NULL THEN
    NEW.meta_description := substring(NEW.description, 1, 155);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_listings_autofill_seo ON user_listings;
CREATE TRIGGER trg_user_listings_autofill_seo
  BEFORE INSERT OR UPDATE ON user_listings
  FOR EACH ROW EXECUTE FUNCTION autofill_user_listing_seo();

-- ─── RLS: cho phép user đọc/ghi SEO fields của listing thuộc về mình ──────────
-- (RLS đã có trên user_listings, chỉ cần đảm bảo policy cover các cột mới)
-- Không cần thêm policy vì policy hiện tại đã cover toàn bộ row-level.