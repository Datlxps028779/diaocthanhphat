# Kontur → taxonomy legacy dry-run

Ngày đo: 2026-08-28
Nguồn thử nghiệm: Kontur Boundaries Vietnam, GeoPackage `kontur_boundaries_VN_20230628.gpkg`, lớp `boundaries`, EPSG:4326. Dữ liệu được ghi nhận là ODbL/OpenStreetMap-derived; nếu dùng trong sản phẩm phải giữ attribution và nghĩa vụ share-alike tương ứng. Polygon nguồn không được chép vào repository trong đợt này.

## Phạm vi và phương pháp

- Đọc hierarchy hiện tại từ Supabase ở chế độ read-only: `areas → districts → wards`.
- DB thực tế: **4 areas, 53 districts, 682 wards**.
- Quy đổi cấp: Kontur `admin_level=4 → area`, `7 → district`, `10 → ward`.
- Chuẩn hóa tên chỉ để tạo ứng viên; kết quả cuối phải đúng parent polygon.
- District được nhận khi tên khớp và polygon nằm trong area đúng.
- Ward được nhận khi tên khớp và polygon nằm trong district đúng.
- Không chọn theo `first result`, tâm điểm geocoder, hay tên xã cùng tên ở tỉnh/huyện khác.
- Không đưa geometry có `administrative_vintage` khác `legacy_pre_merger` vào luồng cũ.

## Kết quả

| Cấp | Kết quả |
|---|---:|
| Area khớp tên + parent | 4/4 |
| District khớp tên + containment | 53/53 |
| Ward có ứng viên đúng tên + containment | 647/682 |
| Ward ID có mapping duy nhất | 644/682 |
| Ward chưa đủ bằng chứng để seed | 38 |

Ba ward mapping trùng ứng viên không được tự chọn; chúng phải được xử lý như ambiguous nếu không có khóa nguồn hoặc đối chiếu bổ sung.

## Các case bắt buộc

### Bình Phước → Đồng Phú → Tân Phước

Không có polygon Kontur nào vừa mang tên `Xã Tân Phước` vừa nằm trong polygon `Huyện Đồng Phú`. Các polygon cùng tên mà dataset trả về nằm trong các huyện khác như Gò Công Đông, Lai Vung, Tân Hồng hoặc Phú Mỹ. Vì vậy case này được đánh dấu **unmatched**, tuyệt đối không gán một polygon cùng tên ở tỉnh khác.

### Bình Dương → Thuận An → An Phú

Có ứng viên duy nhất đúng parent `Thuận An`, polygon Kontur có bbox xấp xỉ `106.7243876–106.7533589`, `10.9265874–10.9694922`. Đây là mapping có thể tiếp tục review để seed.

### Đồng Nai → Tân Phú → Đắc Lua

Kontur không có bản ghi tên `Đắc Lua`/`Đak Lua` tương ứng trong lớp ward. Không được suy ra từ điểm district `Tân Phú`, không dùng geocoder để thay polygon legacy.

## Kết luận và trạng thái seed

Kontur đủ tốt để chứng minh và cung cấp **53/53 district bounds**, cùng phần lớn ward bounds, nhưng **chưa đủ để hoàn thành geometry legacy 3 cấp**. Đặc biệt, hai case acceptance `Đồng Phú → Tân Phước` và `Tân Phú → Đắc Lua` chưa có dữ liệu hợp lệ từ nguồn này.

Do đó đợt này:

- Không tạo SQL seed một phần.
- Không chạy migration hoặc SQL trên production.
- Không đưa polygon cùng tên sai parent vào `taxonomy_geo`.
- Code frontend ưu tiên trạng thái `missing_geo` thay vì nhảy sai vị trí.
- Cần một nguồn polygon legacy được cấp phép và còn giữ đúng vintage cũ, hoặc hồ sơ đối chiếu riêng cho 38 ward còn thiếu, trước khi publish geometry.
