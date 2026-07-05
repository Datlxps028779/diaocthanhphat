
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
