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
