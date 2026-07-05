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
