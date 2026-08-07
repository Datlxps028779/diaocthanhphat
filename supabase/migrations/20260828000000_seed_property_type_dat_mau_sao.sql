-- Thêm loại BĐS "Đất mẫu, đất sào".
--
-- Mọi nơi hiển thị loại BĐS (form đăng tin, bộ lọc, footer, AI search, định giá,
-- gợi ý, sitemap) đều đọc động từ bảng này, nên chỉ cần thêm dòng — không sửa code.
--
-- Tên đặt "Đất mẫu, đất sào" chứ không phải "Đất Mẫu/Đất Sào": footer dựng nhãn bằng
-- `Bán ${name.toLowerCase()}` nên dấu gạch chéo sẽ ra "Bán đất mẫu/đất sào" dính liền,
-- mà chuỗi đó là anchor text đi thẳng ra Google.
--
-- icon để null giống các loại đất khác (Đất nền, Đất dự án); admin đổi được sau.
--
-- KHÔNG đụng tin đăng đang có: 3 tin ≥1000m² (6782m², 1447m², 1389m²) vẫn nằm ở
-- "Đất nền" theo yêu cầu — người dùng tự chuyển trong admin.

INSERT INTO property_types (name, slug, icon)
VALUES ('Đất mẫu, đất sào', 'dat-mau-dat-sao', NULL)
ON CONFLICT (slug) DO NOTHING;
