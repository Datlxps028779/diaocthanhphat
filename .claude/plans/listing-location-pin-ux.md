# Cải thiện định vị bản đồ khi đăng sản phẩm

## Mục tiêu

Giúp người mới có thể xác định vị trí tin đăng nhanh và đúng hơn, đặc biệt khi nhập **Địa chỉ chi tiết** rồi bấm tìm trên bản đồ. Không coi kết quả geocode tự động là tọa độ chính xác tuyệt đối; người đăng luôn có bước xác nhận/điều chỉnh ghim trước khi lưu.

## Chẩn đoán hiện tại

- [`src/components/LocationPicker.tsx`](../../src/components/LocationPicker.tsx) dùng Nominatim public với `limit=1`, không giới hạn quốc gia/vùng bằng `countrycodes`, không kiểm tra độ chính xác/kết quả ngoài khu vực và luôn lấy kết quả đầu tiên.
- Khi geocode không ra kết quả, code tự bỏ dần token từ đầu (`số nhà/đường → xã → huyện → tỉnh`) rồi vẫn fly tới kết quả thô hơn. Người dùng không được báo rằng bản đồ đã lùi xuống cấp xã/huyện/tỉnh, nên dễ tưởng ghim đã đúng địa chỉ.
- [`src/screens/PostListingPage.tsx`](../../src/screens/PostListingPage.tsx) và [`src/components/admin/tabs/PropertiesTab.tsx`](../../src/components/admin/tabs/PropertiesTab.tsx) gọi geocode với chuỗi ghép tự do; cách ghép `địa chỉ, xã, huyện, tỉnh` chưa gửi ràng buộc vùng/quốc gia rõ ràng.
- Bản đồ chỉ có hướng dẫn `(click để thả ghim)`, không có trạng thái đang tìm/đã tìm/không tìm thấy, không có nút vị trí hiện tại, không có nút xác nhận ghim hay cảnh báo “kết quả chỉ là ước tính”. Hai ô latitude/longitude thô làm người mới bối rối.
- Reverse geocode sau click/kéo ghim tự ghi đè `address`; nếu người dùng đã nhập địa chỉ chi tiết, thao tác kéo ghim có thể làm mất phần số nhà/đường mà họ muốn giữ.
- Hai form user và admin dùng chung picker nhưng có hai luồng callback riêng; cần giữ hành vi nhất quán, không chỉ sửa một form.

## Thiết kế đề xuất

### 1. Tách geocoding thành kết quả có độ tin cậy và phạm vi

- Tạo helper thuần, ví dụ `src/lib/geocoding.ts`, để chuẩn hóa query/response và có thể test không cần Leaflet.
- Request Nominatim với `countrycodes=vn`, `addressdetails=1`, `limit=5`, `accept-language=vi`, và nếu phù hợp truyền `viewbox`/`bounded=1` cho tỉnh đã chọn. Không gửi địa chỉ/PII ngoài dữ liệu vị trí người dùng nhập; tuân thủ User-Agent/attribution và debounce hiện có.
- Chọn kết quả bằng điểm `importance`, `type`/`class`, và kiểm tra bounding box/địa danh có khớp tỉnh-huyện-xã đã chọn. Không tự coi `limit=1` là đúng.
- Trả về `exact | area | none`, tên hiển thị, tọa độ và lý do. Nếu chỉ tìm được huyện/tỉnh thì chỉ zoom tới cấp đó và bắt người dùng xác nhận ghim thủ công.
- Có cơ chế hủy request cũ (AbortController hoặc request id) để kết quả tìm chậm không ghi đè lần tìm mới.

### 2. Luồng người mới rõ ràng

- Đổi nhãn thành các bước: **Bước 1 chọn tỉnh/huyện/xã → Bước 2 nhập địa chỉ → Bước 3 bấm “Đưa bản đồ tới địa chỉ” → Bước 4 kéo ghim đỏ vào đúng vị trí → Bước 5 kiểm tra và xác nhận**.
- Thêm trạng thái trực quan dưới nút: đang tìm, tìm được theo địa chỉ chi tiết, chỉ tìm được theo khu vực, không tìm thấy; nêu rõ người dùng phải kéo ghim nếu kết quả không phải số nhà.
- Thêm nút **“Dùng vị trí hiện tại”** (chỉ sau khi người dùng chủ động bấm, xin quyền trình duyệt, lỗi quyền có thông báo). Đây là tùy chọn hỗ trợ, không tự thu thập vị trí nền và không thay địa chỉ đã nhập nếu người dùng chưa xác nhận.
- Thêm nút **“Đặt ghim tại tâm bản đồ”** hoặc hướng dẫn crosshair/click lớn trên mobile; tăng vùng thao tác, marker draggable rõ ràng, hiển thị nhãn “Ghim hiện tại”.
- Khi có tọa độ, hiển thị chip **“Đã ghim vị trí — hãy kiểm tra ghim có đúng thửa đất không”** và nút **“Xóa ghim”**. Ẩn latitude/longitude khỏi luồng chính; đưa vào phần “Nâng cao” chỉ cho admin/người am hiểu.
- Giữ địa chỉ người dùng nhập làm nguồn chính. Reverse geocode chỉ cập nhật địa chỉ khi người dùng bấm “Dùng địa chỉ từ ghim” hoặc khi trường địa chỉ còn trống; không âm thầm ghi đè.
- Nếu chưa có tọa độ, cho phép tiếp tục theo chính sách hiện tại nhưng cảnh báo rõ tin sẽ không có vị trí bản đồ; nếu yêu cầu dữ liệu phải có tọa độ thì bổ sung validation riêng sau khi đo dữ liệu thật.

### 3. Sửa đồng bộ hai form

- Dùng cùng `LocationPicker` contract cho [`PostListingPage`](../../src/screens/PostListingPage.tsx) và [`PropertiesTab`](../../src/components/admin/tabs/PropertiesTab.tsx): callback trạng thái geocode, callback chọn địa chỉ từ ghim, callback xóa ghim.
- Khi chọn tỉnh/huyện/xã, giữ việc fly-to nhưng dùng query có cấu trúc và zoom theo cấp; không coi fly-to cấp tỉnh/huyện là ghim chính xác.
- Khi nhập địa chỉ chi tiết, không geocode mỗi phím; chỉ geocode khi bấm nút hoặc Enter, đồng thời hủy kết quả cũ.
- Kiểm tra biên tọa độ Việt Nam (`lat` khoảng 8–24, `lng` khoảng 102–110) trước khi lưu; từ chối NaN/Infinity và tọa độ ngoài vùng nếu kết quả geocode không khớp vùng đã chọn. Không tự sửa tọa độ người dùng mà không báo.

## Kiểm thử và xác minh

1. Unit tests cho helper: query có country code; chọn kết quả khớp tỉnh; fallback cấp huyện/tỉnh trả trạng thái `area`; không có kết quả; hủy request cũ; tọa độ ngoài Việt Nam bị loại; reverse geocode không ghi đè địa chỉ khi chưa xác nhận.
2. Typecheck, Vitest, build production và `graphify update .`.
3. Browser Chrome thật trên desktop và mobile viewport:
   - địa chỉ cụ thể có kết quả và zoom;
   - địa chỉ không đủ dữ liệu hiển thị cảnh báo, không giả vờ chính xác;
   - click/kéo ghim cập nhật tọa độ;
   - reverse address chỉ thay đổi sau thao tác xác nhận;
   - luồng vị trí hiện tại xử lý allow/deny;
   - reload bước form không làm marker/label lệch.
4. Kiểm thử cả form người dùng `/dang-tin` và form Admin → Bất động sản.
5. Chạy kiểm tra rate-limit/network: không request khi gõ, không có request song song cũ cập nhật state, giữ attribution OpenStreetMap và xử lý lỗi mạng.
6. Ghi verify-gate receipt với các màn hình/viewport đã mở và phần không thể kiểm do cần đăng nhập. Chỉ viết migration nếu phát hiện cần thay đổi schema; SQL production vẫn do người dùng tự chạy.
