# Kế hoạch: GA4 phân tích hành vi chuyên sâu

## Mục tiêu

Mở rộng tab **Thống kê website** để phản ánh hành vi khách hàng thực tế, đồng thời loại các đường dẫn nội bộ `/quantrithethong/*` và `/noi-bo/*` khỏi mọi báo cáo GA4. Không đưa service-account private key hoặc access token xuống trình duyệt.

## Phạm vi triển khai

### 1. Lọc traffic nội bộ ở server

- Tạo bộ lọc GA4 Data API dùng chung cho `pagePath`, loại các path bắt đầu bằng `/quantrithethong` hoặc `/noi-bo`.
- Áp dụng bộ lọc cho overview, dữ liệu theo ngày và top pages hiện có.
- Ghi chú rõ trong UI rằng dữ liệu lịch sử đã gửi vào GA4 không bị xóa; bộ lọc chỉ loại chúng khỏi báo cáo hiện tại và ngăn dữ liệu mới nhờ cơ chế private workspace hiện có.
- Không lọc theo chuỗi tên người dùng, email, số điện thoại hay dữ liệu PII.

### 2. Chuẩn hóa event hành vi công khai

Tận dụng facade `track()` và consent hiện có, bổ sung các event còn thiếu ở các điểm có ý nghĩa:

- `listing_view`: ghi một lần khi mở chi tiết tin công khai.
- `listing_save`: ghi khi người dùng bật yêu thích.
- `content_share`: ghi nền tảng chia sẻ (`native`, `copy`, `facebook`, `zalo`) sau khi thao tác thành công.

Giữ các event đã có như `search`, `listing_result_click`, `contact_open`, `lead_submit`, `phone_reveal`, `zalo_click`, saved-search và AI events. Chỉ gửi GA4 khi người dùng đã consent; không gửi PII hoặc nội dung tìm kiếm thô có thể chứa thông tin cá nhân.

### 3. Mở rộng server-side GA4 report

Mở rộng `GoogleAnalyticsReport` bằng các dữ liệu tổng hợp:

- **Phễu hành vi**: số event và người dùng cho `search`, `listing_view`, `contact_open`, `lead_submit`, `phone_reveal`, `zalo_click`.
- **Event phổ biến**: event name, event count, active users.
- **Nguồn truy cập**: session source/medium, sessions, active users, engagement rate.
- **Thiết bị**: device category, sessions, active users, page views.

Các truy vấn dùng chung access token server-side, giới hạn số dòng, chỉ gọi GA4 Data API. Các report page-based vẫn gắn filter loại private paths. Event report không dùng dimension chứa PII.

### 4. UI Admin

Mở rộng `GoogleAnalyticsTab` với các khu vực:

- Phễu `Tìm kiếm → Xem tin → Mở liên hệ → Gửi lead`, có số lượng và tỷ lệ chuyển bước.
- Bảng hành động nổi bật.
- Bảng nguồn truy cập và thiết bị.
- Giữ nguyên bộ chọn 7/30/90 ngày, các metric tổng quan, biểu đồ theo ngày và top pages.
- Hiển thị trạng thái thiếu cấu hình/lỗi API như hiện tại; không hiển thị credential.
- Đánh dấu rõ dữ liệu là traffic công khai sau khi loại workspace nội bộ.

### 5. Kiểm thử và xác minh

- Bổ sung unit test cho:
  - bộ lọc path nội bộ trong request GA4;
  - normalize các payload event/source/device/funnel;
  - không đưa access token vào report;
  - event mới được sanitize và chỉ gửi khi consent.
- Chạy typecheck, test liên quan, production build.
- Chạy `graphify update .` sau khi sửa code.
- Khởi động bản production mới và dùng Chrome/Playwright kiểm tra tab Admin, chuyển range, tải lại báo cáo và xác nhận không có private key/token trong response hoặc UI.
- Ghi verify receipt với ghi chú runtime cụ thể; chỉ commit/push khi có người dùng phê duyệt riêng.

## File dự kiến thay đổi

- `src/lib/server/googleAnalytics.ts`
- `src/lib/server/googleAnalytics.test.ts`
- `src/lib/api/googleAnalytics.ts`
- `src/components/admin/tabs/GoogleAnalyticsTab.tsx`
- `src/lib/analytics.ts`
- `src/lib/analytics.test.ts`
- `src/screens/PropertyDetailPage.tsx`
- `src/LandingPage.tsx`
- `src/screens/ListingsPage.tsx` (nếu cần gắn event yêu thích tại điểm dùng chung)
- `src/components/DetailShareButtons.tsx`

Không thay đổi SQL production, không gửi credential lên client, không tự chạy production SQL và không tự push.

## Thứ tự thực hiện

1. Hoàn thiện server filter + report types/query/normalization và tests.
2. Gắn các event công khai còn thiếu và tests facade.
3. Cập nhật API client + UI report.
4. Chạy kiểm thử/build/graphify/runtime browser verification.
5. Báo cáo kết quả và chờ phê duyệt commit/push riêng.
