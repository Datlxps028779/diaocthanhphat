# Ảnh bìa chia sẻ trang chủ

## Mục tiêu

Làm rõ nơi quản trị ảnh Open Graph của trang `/`, để người quản trị có thể thay ảnh bìa khi chia sẻ trang chủ qua Facebook, Zalo và các ứng dụng đọc Open Graph — không nhầm với ảnh nền Hero.

## Phát hiện hiện tại

- [`app/layout.tsx`](../../app/layout.tsx) đã lấy `site_settings.og_image` làm ảnh Open Graph/Twitter toàn site; nếu rỗng, nó lần lượt fallback sang `site_logo_url` và ảnh mặc định.
- [`src/components/admin/tabs/SiteSettingsTab.tsx`](../../src/components/admin/tabs/SiteSettingsTab.tsx) đã có API đọc/lưu `site_settings` và `ImageUrlInput`, nhưng `og_image` chỉ nằm lẫn trong nhóm SEO nên khó nhận biết.
- [`src/components/admin/tabs/HomeExperienceTab.tsx`](../../src/components/admin/tabs/HomeExperienceTab.tsx) quản lý nội dung/ảnh Hero trong `page_sections`; đó là một nguồn khác và không nên dùng làm ảnh chia sẻ.
- [`src/components/ImageUpload.tsx`](../../src/components/ImageUpload.tsx) đã cung cấp upload, thư viện ảnh, preview và xóa giá trị cho một URL ảnh.

## Thiết kế được triển khai

1. Tại tab **Cài đặt trang web → SEO**, thêm một thẻ nổi bật đứng trước danh sách setting thông thường: **“Ảnh bìa chia sẻ trang chủ”**.
2. Thẻ hiển thị rõ phạm vi `https://chonhaviet.com/`, giải thích dùng cho Facebook/Zalo/Open Graph/Twitter, đồng thời khẳng định không thay ảnh Hero trang chủ.
3. Dùng lại `ImageUrlInput` với thư mục `branding` để upload, chọn từ thư viện, dán URL, xem trước và xóa ảnh. Giá trị lưu vào key chuẩn `og_image`.
4. Nút lưu độc lập của thẻ dùng cùng `updateSiteSetting`, có trạng thái đang lưu/đã lưu/lỗi rõ ràng. Không tạo setting hoặc migration mới vì `og_image` đã là nguồn dữ liệu chính.
5. Thêm hướng dẫn kích thước 1200×630 px và lưu ý nền tảng xã hội có thể cache ảnh cũ; sau khi lưu có thể cần “debug/re-scrape” từ Facebook/Zalo để xem preview mới.
6. Không đổi fallback trong `app/layout.tsx`: xóa ảnh đã cấu hình sẽ trở về logo rồi ảnh mặc định, tránh trang share thiếu ảnh.

## Kiểm tra sau khi code

1. Typecheck và Vitest.
2. Chạy `graphify update .`.
3. Mở Admin bằng Chrome thật khi có phiên owner: tab SEO, upload/chọn ảnh, lưu, tải lại và xác nhận preview/giá trị vẫn còn.
4. Mở `/` bằng Chrome thật, kiểm tra thẻ Open Graph/tải ảnh thực tế từ browser; ghi rõ nếu không có phiên Admin để kiểm tra runtime phần quản trị.
5. Ghi receipt qua verify gate. Chỉ commit/push khi được phê duyệt riêng.
