-- Chủ hỗ trợ vay ngân hàng (vay 3 bên): số tiền chủ cam kết hỗ trợ vay, CÙNG đơn vị
-- với cột price (vd giá 5 tỷ, loan_support 3.5 → khách trả trước 1.5 tỷ). Null = không
-- hỗ trợ vay. Áp cho cả tin admin (properties) lẫn tin user đăng (user_listings).
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS loan_support numeric;

ALTER TABLE user_listings
  ADD COLUMN IF NOT EXISTS loan_support numeric;

NOTIFY pgrst, 'reload schema';
