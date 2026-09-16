-- Chỉ thêm section thiếu; không ghi đè cấu hình hoặc bật khối khu vực.
-- order_index có thể trùng; frontend đặt timeline trước featured_sections khi bằng nhau.
INSERT INTO public.page_sections (id, label, description, icon, is_visible, order_index, settings)
VALUES (
  'timeline',
  'Dòng thời gian tin đăng',
  'Tin bất động sản công khai theo ngày và 12 khung giờ',
  'Clock',
  true,
  3,
  '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
