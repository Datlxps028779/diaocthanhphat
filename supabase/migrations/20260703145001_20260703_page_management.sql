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
