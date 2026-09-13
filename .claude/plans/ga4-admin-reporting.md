# Kế hoạch: Thống kê GA4 trong Admin

## Mục tiêu

- Giữ `/noi-bo` và `/quantrihethong` không tự gửi lượt xem vào GA4.
- Thêm tab **Thống kê website** trong Admin để admin xem số liệu GA4 thật qua server-side Google Analytics Data API.
- Không đưa service-account private key hoặc access token xuống trình duyệt.
- Nếu server chưa cấu hình GA4, hiển thị trạng thái cấu hình rõ ràng thay vì số liệu giả.

## Phạm vi kỹ thuật

### 1. Server-side GA4 client

Tạo `src/lib/server/googleAnalytics.ts` theo pattern của `googleSearchConsole.ts`:

- Đọc các biến môi trường:
  - `GOOGLE_ANALYTICS_CLIENT_EMAIL`
  - `GOOGLE_ANALYTICS_PRIVATE_KEY`
  - `GOOGLE_ANALYTICS_PROPERTY_ID` (chỉ chuỗi số property ID)
- Tạo JWT service-account assertion cho scope `https://www.googleapis.com/auth/analytics.readonly`.
- Lấy access token từ `oauth2.googleapis.com/token`.
- Gọi `https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport`.
- Chuẩn hóa lỗi Google thành mã nội bộ, không trả credential/raw response.
- Có hàm configuration state (`not_configured`, `configured`, `invalid`) và hàm map report rows thành kiểu dữ liệu UI.
- Report mặc định: 30 ngày gần nhất, theo ngày, gồm `activeUsers`, `newUsers`, `sessions`, `screenPageViews`, `engagementRate`; thêm report top pages theo `pagePath` gồm `screenPageViews`, `activeUsers`.
- Giới hạn date range/page rows server-side để tránh request tốn kém; nhận `days` chỉ trong khoảng 7–90.

### 2. Admin API route

Tạo `app/api/admin/google-analytics/route.ts`:

- `runtime = 'nodejs'`.
- Dùng `requireOwner`, chỉ owner-MFA/admin được gọi; staff không được xem tab này.
- Lấy Bearer token từ client giống route Search Visibility.
- GET trả:
  - `configurationState`.
  - `range`.
  - `overview`.
  - `daily`.
  - `topPages`.
- Trả lỗi 401/403/503 rõ ràng; không để lộ Google credentials.
- Không ghi dữ liệu analytics vào Supabase ở phase này; GA4 là nguồn số liệu.

### 3. Admin UI

- Thêm `google-analytics` vào `AdminTab`.
- Thêm tab lazy-loaded trong `AdminPanel`, chỉ xuất hiện trong `ALL_TABS` của admin; không thêm vào `STAFF_TABS`.
- Tạo `src/components/admin/tabs/GoogleAnalyticsTab.tsx`:
  - Chọn 7/30/90 ngày.
  - Nút tải lại.
  - Hiển thị trạng thái chưa cấu hình/quyền Google lỗi/thành công.
  - Thẻ tổng quan: người dùng, người dùng mới, phiên, lượt xem, engagement rate.
  - Biểu đồ/bảng theo ngày bằng CSS/HTML thuần, không thêm chart dependency.
  - Bảng top trang, xử lý page path rỗng/an toàn.
  - Ghi rõ số liệu là GA4 và không bao gồm hoạt động admin vì admin routes không tải tracking.

### 4. Tests

- Unit tests cho config validation, JWT claim/scope, date range validation, Google API response normalization, error mapping.
- Test route auth/configured/not-configured và đảm bảo private key không xuất hiện trong JSON.
- Cập nhật `adminAccess.test.ts` xác nhận admin thấy tab và staff không thấy.
- Không dùng số liệu giả trong UI; trạng thái chưa cấu hình phải hiển thị rỗng có hướng dẫn.

### 5. Kiểm chứng/runtime

- `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`, `graphify update .`.
- Browser Chrome thật trên production build local:
  - Admin chưa đăng nhập: API/tab bị chặn, không rò dữ liệu.
  - Public `/`: vẫn giữ banner consent và không có nút mở lại sau consent.
  - `/quantrihethong`: không có cookie UI.
  - Có thể kiểm UI tab bằng trạng thái chưa cấu hình; không bịa kết quả GA4 nếu chưa có credentials.
- Ghi verify receipt nêu rõ phần GA4 live chỉ kiểm được sau khi user cấu hình secrets + cấp quyền service account.

## Secrets và triển khai

- Không tự đặt hoặc commit private key.
- Sau khi code được verify, báo user cần cấu hình 3 secrets server trên Vercel/deploy và thêm service account vào GA4 Property với quyền Viewer.
- Chỉ gọi Google API sau khi secrets tồn tại; không chạy thao tác ghi trên Google.

## Commit/push

- Commit code sau verify.
- Không push nếu chưa có quyền push riêng; nếu user cho phép thì push commit này.
