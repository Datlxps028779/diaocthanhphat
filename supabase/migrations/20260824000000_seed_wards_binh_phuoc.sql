-- =============================================================================
-- Seed phường/xã cho Bình Phước (111 xã / 11 huyện)
-- =============================================================================
-- Bình Phước là tỉnh duy nhất chưa có dữ liệu cấp xã: migration
-- 20260712000000_seed_wards_3provinces.sql chỉ dựng 3 tỉnh kia và ghi rõ "Bình
-- Phước GIỮ NGUYÊN". Hệ quả: admin không gắn được khu dân cư vào Bình Phước vì ô
-- chọn chỉ liệt kê phường/xã.
--
-- Dữ liệu theo địa giới TRƯỚC sáp nhập 01/07/2025 (11 huyện, 111 xã). Cố ý dùng
-- danh sách cũ để khớp với ba tỉnh còn lại — chúng cũng theo địa giới trước sáp
-- nhập; trộn hai hệ địa giới sẽ làm dữ liệu vị trí mâu thuẫn nhau. Sau sáp nhập
-- Bình Phước đã nhập vào Đồng Nai và 111 xã cũ gom lại còn 40 xã mới; khi nào
-- chuyển sang hệ mới thì phải chuyển đồng thời cả bốn tỉnh.
--
-- Quy ước bám đúng migration cũ: bỏ tiền tố "Thành phố/Huyện/Phường/Xã/Thị trấn";
-- slug xã = {slug huyện}-{tên xã}. Tiền tố huyện là bắt buộc vì tên xã trùng nhau
-- giữa các huyện (Minh Hưng ở cả Chơn Thành và Bù Đăng, Tân Thành ở cả Đồng Xoài
-- và Bù Đốp, Tân Hưng/Tân Lợi/Tân Tiến ở nhiều huyện).
--
-- Idempotent: ON CONFLICT (slug) DO NOTHING. Chạy lại không nhân đôi dữ liệu.

-- Huyện Phú Riềng còn thiếu trong bảng districts (DB có 10/11 huyện).
INSERT INTO districts (area_id, name, slug, order_index)
SELECT a.id, 'Phú Riềng', 'phu-rieng', 11
FROM areas a WHERE a.slug = 'binh-phuoc'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO wards (district_id, name, slug, order_index)
SELECT d.id, v.name, v.slug, v.ord FROM districts d JOIN (VALUES
  -- TP. Đồng Xoài (8)
  ('dong-xoai','Tân Bình','dong-xoai-tan-binh',1),
  ('dong-xoai','Tân Đồng','dong-xoai-tan-dong',2),
  ('dong-xoai','Tân Phú','dong-xoai-tan-phu',3),
  ('dong-xoai','Tân Thiện','dong-xoai-tan-thien',4),
  ('dong-xoai','Tân Xuân','dong-xoai-tan-xuan',5),
  ('dong-xoai','Tiến Thành','dong-xoai-tien-thanh',6),
  ('dong-xoai','Tân Thành','dong-xoai-tan-thanh',7),
  ('dong-xoai','Tiến Hưng','dong-xoai-tien-hung',8),
  -- TX. Bình Long (6)
  ('binh-long','An Lộc','binh-long-an-loc',1),
  ('binh-long','Hưng Chiến','binh-long-hung-chien',2),
  ('binh-long','Phú Đức','binh-long-phu-duc',3),
  ('binh-long','Phú Thịnh','binh-long-phu-thinh',4),
  ('binh-long','Thanh Lương','binh-long-thanh-luong',5),
  ('binh-long','Thanh Phú','binh-long-thanh-phu',6),
  -- TX. Phước Long (7)
  ('phuoc-long','Long Phước','phuoc-long-long-phuoc',1),
  ('phuoc-long','Long Thủy','phuoc-long-long-thuy',2),
  ('phuoc-long','Phước Bình','phuoc-long-phuoc-binh',3),
  ('phuoc-long','Sơn Giang','phuoc-long-son-giang',4),
  ('phuoc-long','Thác Mơ','phuoc-long-thac-mo',5),
  ('phuoc-long','Long Giang','phuoc-long-long-giang',6),
  ('phuoc-long','Phước Tín','phuoc-long-phuoc-tin',7),
  -- TX. Chơn Thành (9)
  ('chon-thanh','Hưng Long','chon-thanh-hung-long',1),
  ('chon-thanh','Minh Hưng','chon-thanh-minh-hung',2),
  ('chon-thanh','Minh Long','chon-thanh-minh-long',3),
  ('chon-thanh','Minh Thành','chon-thanh-minh-thanh',4),
  ('chon-thanh','Thành Tâm','chon-thanh-thanh-tam',5),
  ('chon-thanh','Minh Lập','chon-thanh-minh-lap',6),
  ('chon-thanh','Minh Thắng','chon-thanh-minh-thang',7),
  ('chon-thanh','Nha Bích','chon-thanh-nha-bich',8),
  ('chon-thanh','Quang Minh','chon-thanh-quang-minh',9),
  -- H. Bù Đăng (16)
  ('bu-dang','Đức Phong','bu-dang-duc-phong',1),
  ('bu-dang','Bình Minh','bu-dang-binh-minh',2),
  ('bu-dang','Bom Bo','bu-dang-bom-bo',3),
  ('bu-dang','Đak Nhau','bu-dang-dak-nhau',4),
  ('bu-dang','Đoàn Kết','bu-dang-doan-ket',5),
  ('bu-dang','Đăng Hà','bu-dang-dang-ha',6),
  ('bu-dang','Đồng Nai','bu-dang-dong-nai',7),
  ('bu-dang','Đức Liễu','bu-dang-duc-lieu',8),
  ('bu-dang','Đường 10','bu-dang-duong-10',9),
  ('bu-dang','Minh Hưng','bu-dang-minh-hung',10),
  ('bu-dang','Nghĩa Bình','bu-dang-nghia-binh',11),
  ('bu-dang','Nghĩa Trung','bu-dang-nghia-trung',12),
  ('bu-dang','Phú Sơn','bu-dang-phu-son',13),
  ('bu-dang','Phước Sơn','bu-dang-phuoc-son',14),
  ('bu-dang','Thọ Sơn','bu-dang-tho-son',15),
  ('bu-dang','Thống Nhất','bu-dang-thong-nhat',16),
  -- H. Bù Đốp (7)
  ('bu-dop','Thanh Bình','bu-dop-thanh-binh',1),
  ('bu-dop','Thanh Hòa','bu-dop-thanh-hoa',2),
  ('bu-dop','Phước Thiện','bu-dop-phuoc-thien',3),
  ('bu-dop','Tân Thành','bu-dop-tan-thanh',4),
  ('bu-dop','Tân Tiến','bu-dop-tan-tien',5),
  ('bu-dop','Hưng Phước','bu-dop-hung-phuoc',6),
  ('bu-dop','Thiện Hưng','bu-dop-thien-hung',7),
  -- H. Bù Gia Mập (8)
  ('bu-gia-map','Bình Thắng','bu-gia-map-binh-thang',1),
  ('bu-gia-map','Bù Gia Mập','bu-gia-map-bu-gia-map',2),
  ('bu-gia-map','Đa Kia','bu-gia-map-da-kia',3),
  ('bu-gia-map','Đak Ơ','bu-gia-map-dak-o',4),
  ('bu-gia-map','Đức Hạnh','bu-gia-map-duc-hanh',5),
  ('bu-gia-map','Phú Nghĩa','bu-gia-map-phu-nghia',6),
  ('bu-gia-map','Phú Văn','bu-gia-map-phu-van',7),
  ('bu-gia-map','Phước Minh','bu-gia-map-phuoc-minh',8),
  -- H. Đồng Phú (11)
  ('dong-phu','Tân Phú','dong-phu-tan-phu',1),
  ('dong-phu','Đồng Tâm','dong-phu-dong-tam',2),
  ('dong-phu','Đồng Tiến','dong-phu-dong-tien',3),
  ('dong-phu','Tân Hòa','dong-phu-tan-hoa',4),
  ('dong-phu','Tân Hưng','dong-phu-tan-hung',5),
  ('dong-phu','Tân Lập','dong-phu-tan-lap',6),
  ('dong-phu','Tân Lợi','dong-phu-tan-loi',7),
  ('dong-phu','Tân Phước','dong-phu-tan-phuoc',8),
  ('dong-phu','Tân Tiến','dong-phu-tan-tien',9),
  ('dong-phu','Thuận Lợi','dong-phu-thuan-loi',10),
  ('dong-phu','Thuận Phú','dong-phu-thuan-phu',11),
  -- H. Hớn Quản (13)
  ('hon-quan','Tân Khai','hon-quan-tan-khai',1),
  ('hon-quan','An Khương','hon-quan-an-khuong',2),
  ('hon-quan','An Phú','hon-quan-an-phu',3),
  ('hon-quan','Đồng Nơ','hon-quan-dong-no',4),
  ('hon-quan','Minh Đức','hon-quan-minh-duc',5),
  ('hon-quan','Minh Tâm','hon-quan-minh-tam',6),
  ('hon-quan','Phước An','hon-quan-phuoc-an',7),
  ('hon-quan','Tân Hiệp','hon-quan-tan-hiep',8),
  ('hon-quan','Tân Hưng','hon-quan-tan-hung',9),
  ('hon-quan','Tân Lợi','hon-quan-tan-loi',10),
  ('hon-quan','Tân Quan','hon-quan-tan-quan',11),
  ('hon-quan','Thanh An','hon-quan-thanh-an',12),
  ('hon-quan','Thanh Bình','hon-quan-thanh-binh',13),
  -- H. Lộc Ninh (16)
  ('loc-ninh','Lộc Ninh','loc-ninh-loc-ninh',1),
  ('loc-ninh','Lộc An','loc-ninh-loc-an',2),
  ('loc-ninh','Lộc Điền','loc-ninh-loc-dien',3),
  ('loc-ninh','Lộc Hiệp','loc-ninh-loc-hiep',4),
  ('loc-ninh','Lộc Hòa','loc-ninh-loc-hoa',5),
  ('loc-ninh','Lộc Hưng','loc-ninh-loc-hung',6),
  ('loc-ninh','Lộc Khánh','loc-ninh-loc-khanh',7),
  ('loc-ninh','Lộc Phú','loc-ninh-loc-phu',8),
  ('loc-ninh','Lộc Quang','loc-ninh-loc-quang',9),
  ('loc-ninh','Lộc Tấn','loc-ninh-loc-tan',10),
  ('loc-ninh','Lộc Thái','loc-ninh-loc-thai',11),
  ('loc-ninh','Lộc Thạnh','loc-ninh-loc-thanh-2',12),
  ('loc-ninh','Lộc Thành','loc-ninh-loc-thanh',13),
  ('loc-ninh','Lộc Thiện','loc-ninh-loc-thien',14),
  ('loc-ninh','Lộc Thịnh','loc-ninh-loc-thinh',15),
  ('loc-ninh','Lộc Thuận','loc-ninh-loc-thuan',16),
  -- H. Phú Riềng (10)
  ('phu-rieng','Bình Sơn','phu-rieng-binh-son',1),
  ('phu-rieng','Bình Tân','phu-rieng-binh-tan',2),
  ('phu-rieng','Bù Nho','phu-rieng-bu-nho',3),
  ('phu-rieng','Long Bình','phu-rieng-long-binh',4),
  ('phu-rieng','Long Hà','phu-rieng-long-ha',5),
  ('phu-rieng','Long Hưng','phu-rieng-long-hung',6),
  ('phu-rieng','Long Tân','phu-rieng-long-tan',7),
  ('phu-rieng','Phú Riềng','phu-rieng-phu-rieng',8),
  ('phu-rieng','Phú Trung','phu-rieng-phu-trung',9),
  ('phu-rieng','Phước Tân','phu-rieng-phuoc-tan',10)
) AS v(district_slug, name, slug, ord) ON d.slug = v.district_slug
ON CONFLICT (slug) DO NOTHING;
