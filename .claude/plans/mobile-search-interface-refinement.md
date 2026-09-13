# Tinh chỉnh giao diện tìm kiếm mobile

## Phạm vi đã xác định

Tình trạng “các khối ô vuông” chủ yếu nằm ở **form tìm kiếm hero trang chủ** trong [LandingPage.tsx](../../src/LandingPage.tsx). Chrome ở viewport 390px xác nhận form hiện là một cột bốn khối gần như giống hệt nhau: ô từ khóa 48px, ba select xấp xỉ 48px, rồi CTA 48px. Các select native đo phần interactive chỉ 22px cao, khiến khung 48px trông nặng và text/caret bị lệch theo browser. Khối này kéo search hero tới khoảng 650px trước nội dung kế tiếp.

Trang danh sách ở mobile cũng có điểm cần chỉnh liên quan: trigger filter chỉ có icon, drawer cố định 320px, hai cột card bị chật ở máy 320–390px. Tuy nhiên thay đổi chính sẽ ưu tiên luồng tìm ở trang chủ để đúng vấn đề người dùng nêu và giữ scope kiểm soát được.

## Mục tiêu UX

- Ưu tiên rõ ràng: **nhập nhu cầu → chọn hai tiêu chí phổ biến → tìm**.
- Giảm cảm giác tường các ô vuông bằng nhịp dọc nhỏ hơn, select có biểu tượng rõ ràng, và nhóm filter phụ chỉ mở khi cần.
- Tạo vùng chạm ít nhất 44px cho các control.
- Giữ nguyên hoàn toàn state, cascade tỉnh/quận/phường, semantic search, analytics và URL/listing navigation.
- Không thêm nội dung hay dữ liệu hardcode; đây là tinh chỉnh trình bày.

## Kế hoạch triển khai

### 1. Mobile-first cho hero search — [LandingPage.tsx](../../src/LandingPage.tsx)

- Giảm hero mobile từ `min-h-[600px]` xuống chiều cao theo nội dung; chỉ giữ chiều cao lớn tại breakpoint tablet/desktop (`md:min-h-[600px]`).
- Giảm padding mobile của hero và khoảng cách tiêu đề/badge/subtitle; giữ typography desktop hiện tại.
- Bọc form trong card có padding rõ ràng, card radius lớn; dùng radius field nhỏ hơn cho input/select để phân tầng thị giác.
- Giữ input keyword độc lập full width và 48px để là điểm bắt đầu chính.
- Đưa **Khu vực** + **Loại BĐS** vào grid 2 cột ở mobile. Chỉ ở các màn cực hẹp, grid vẫn giữ min-width hợp lý, text 14px và truncate native select tránh chồng lấn.
- Chuyển **Khoảng giá** ra khu filter phụ cùng quận/huyện và phường/xã:
  - ban đầu chỉ hiển thị đường dẫn/button “Thêm tiêu chí: giá, quận/huyện…”;
  - tự mở khi đã có bất kỳ giá trị phụ nào, không làm filter đang có hiệu lực bị ẩn;
  - CTA Tìm kiếm full width ngay dưới lựa chọn chính.
- Tạo select wrapper nhất quán `appearance-none` + ChevronDown không bắt sự kiện, sửa sự lệch/khối native select; thêm padding icon phải.
- Chỉnh quick chips: chỉ dùng scroll ngang ở mobile, không wrap xuống nhiều dòng dưới search, vẫn giữ khả năng truy cập và liên kết hiện tại.

### 2. Chỉnh điểm vào filter của listings mobile — [ListingsPage.tsx](../../src/screens/ListingsPage.tsx)

- Đổi trigger từ icon-only thành control có nhãn `Bộ lọc` trên mobile; giữ min-height 44px, hiển thị indicator/badge khi có filter.
- Làm hàng search + filter wrap chắc chắn ở màn hẹp; input không bị squeeze.
- Đổi drawer fixed `w-80` thành bottom sheet mobile-native (`inset-x-0 bottom-0`, `max-h` theo viewport, `rounded-t-3xl`), desktop sidebar không đổi.
- Điều chỉnh typography mobile trong sheet: labels/options từ 12px lên 14px nơi cần đọc/chạm; giữ group và action sticky.
- Không đổi logic filters, việc reset, hoặc analytics.

### 3. Card result trên màn hình nhỏ — [ListingsPage.tsx](../../src/screens/ListingsPage.tsx)

- Grid property mobile thành 1 cột mặc định, 2 cột từ `sm` để card dưới 390px không bị nén thành khối nhỏ.
- Sửa `ListCard` image width responsive cho mobile để tránh nội dung bị ép.
- Hàng sort/view cho phép wrap; không thay data/view state.

### 4. Xác minh

- Cập nhật/viết test thuần nếu cần để bảo toàn behavior filter; không đưa test visual giả tạo thay cho browser.
- Typecheck, toàn bộ Vitest, production build.
- `graphify update .` sau chỉnh code.
- Real Chrome ở 320px, 390px, 768px, 1440px:
  - hero form không overflow;
  - controls có hit area ≥44px;
  - filter phụ mở/đóng nhưng không làm mất selection;
  - search vẫn điều hướng đúng với criteria;
  - drawer listings đọc/chạm được;
  - grid card không bị quá hẹp.
- Ghi verify receipt. Không commit/push nếu không có phê duyệt riêng.

## Tệp dự kiến

- `src/LandingPage.tsx`
- `src/screens/ListingsPage.tsx`
- Test thuần liên quan nếu cần; tránh sửa API, data model, route hoặc SQL.
