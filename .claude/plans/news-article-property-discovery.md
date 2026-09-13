# Kế hoạch: bài viết → hành trình khám phá bất động sản

## Quyết định sau khi đo dữ liệu production (2026-08-20)

**Chưa triển khai rail “BĐS cùng khu vực bài viết” theo metadata hiện tại.**

Đo read-only cho thấy:

- 62/62 bài published có `geo_area`, 59/62 có `geo_entity`.
- Nhưng chỉ **1/62** `geo_area` khớp chính xác với tên khu vực có trong taxonomy (`Bình Dương`).
- **0/62** `geo_entity` khớp `neighborhood_slug`.
- Kho active có 25 tin (18 Bình Dương, phần còn lại chủ yếu Bình Phước), trong khi phần lớn `geo_area`/`geo_entity` đang là danh sách keyword, cơ quan, tên luật hoặc nhiều địa danh ghép lại — không phải một foreign key/địa lý chuẩn.

Nếu code một fallback “text chứa Bình Dương/Dĩ An…” ở tình trạng này, site sẽ hiển thị sản phẩm dưới bài không thực sự cùng khu vực. Điều đó trái nguyên tắc DB-first, không bịa quan hệ, và làm trải nghiệm giảm thay vì tăng.

## Mục tiêu đúng

Tăng trải nghiệm đọc và chuyển đổi trên `/tin-tuc/[slug]` bằng điều hướng thật giữa **nội dung → entity địa lý chuẩn → tồn kho BĐS active**, không làm bài viết bị chật, không bịa liên kết và không query client nặng.

## Hướng triển khai được điều chỉnh

### Phase A — Chuẩn hóa liên kết bài viết với địa lý (bắt buộc trước rail)

Mở rộng `news` bằng liên kết có cấu trúc thay vì tái dùng các field SEO tự do:

- `area_id uuid null references areas(id)`
- `district_id uuid null references districts(id)`
- `ward_id uuid null references wards(id)`
- `neighborhood_id uuid null references neighborhoods(id)`

Ràng buộc dữ liệu:

1. `neighborhood_id` phải thuộc `area_id`; nếu có district/ward thì phải cùng cây taxonomy.
2. `ward_id` phải thuộc `district_id`; `district_id` phải thuộc `area_id`.
3. Không tự parse/ghi từ keyword tự do. Admin chọn bằng picker cascading tỉnh → huyện → xã → khu dân cư.
4. Các cột `geo_area`, `geo_entity`, `geo_notes` vẫn giữ cho AIO/SEO narrative, nhưng không còn là source để truy vấn BĐS.

Migration phải idempotent. SQL production vẫn do người dùng chạy sau dry-run; không tự chạy.

### Phase B — Admin authoring không kỹ thuật

Trong NewsTab:

- thêm block **“Liên kết nội dung với khu vực & tồn kho”**;
- picker cascading theo taxonomy có sẵn, hiển thị nhãn đã chọn rõ ràng;
- nút xóa liên kết;
- preview: “Bài này sẽ có thể gợi ý tin active ở: …”;
- rule publish: nếu admin chủ động bật gợi ý BĐS mà chưa chọn entity/location hợp lệ thì chặn publish bằng thông báo cụ thể.

Không bắt buộc mọi bài tin pháp lý/vĩ mô phải gắn sản phẩm. Bài không có locality rõ ràng chỉ có điều hướng sang danh mục/đọc tiếp, không có rail sản phẩm.

### Phase C — Server-side contextual property retrieval

Tạo helper server-side trong `src/lib/supabase-server.ts` hoặc module server riêng:

1. Nhận `article.location_*` structured refs và giới hạn.
2. Query `properties` với `is_active=true`.
3. Xếp tầng deterministic:
   - cùng `neighborhood_slug` khi news có `neighborhood_id`;
   - cùng `ward_id`;
   - cùng `district_id`;
   - cùng `area_id`;
   - không có liên kết → trả rỗng, tuyệt đối không keyword-match mơ hồ.
4. Query 6, render tối đa 4, thứ tự `created_at DESC`, `id` tie-breaker.
5. Trả reason code có thể chứng minh: `same_neighborhood`, `same_ward`, `same_district`, `same_area`.
6. Hình thành nhãn UI từ taxonomy thật: “Tin đăng tại [tên khu vực]”, không tạo claim về giá, tiềm năng, khoảng cách hay độ phù hợp.
7. Unit tests: hierarchy, active-only, empty-safe, deterministic order, duplicate/inconsistent linkage handling.

### Phase D — Layout & responsive UX

Tái sử dụng `PropertyDiscoveryRail`; không tạo card system thứ hai.

- **Desktop sidebar:** khối “Tin đăng tại [area/district/neighborhood]” nằm sau bài liên quan/đọc nhiều, card dọc gọn 2–4 tin. Dùng sticky stack hiện có nhưng giới hạn để không đẩy CTA/khối khác quá dài.
- **Mobile:** một rail horizontal “Khám phá tin đăng tại …” sau FAQ/citations, trước “Đọc tiếp” và CTA.
- Với breakpoint, cùng một dataset chỉ render một bề mặt để không lặp content/analytics.
- Mục lục có thể thêm anchor “Tin đăng tại …” chỉ khi rail hiện hữu.
- Article body không có card product ở giữa đoạn.

### Phase E — Server prefetch & analytics

- `app/tin-tuc/[slug]/page.tsx` fetch properties song song với `related`, `mostViewed`, `latest`; truyền snapshot vào `NewsDetailClient`/`NewsPage`.
- Không fetch pool 60 trên client cho mọi người đọc bài.
- Dùng `related_properties` trong `DiscoveryModule` (đã có) với `surface: 'news'`, source structured (`news_area`, `news_district`, …).
- Track module view + click position + listing_type. Không gửi title bài, raw keyword, PII hay nội dung.

### Phase F — Data remediation và rollout an toàn

1. Không backfill tự động theo `geo_area`/`geo_entity` tự do — dữ liệu hiện tại chứng minh điều đó không đáng tin.
2. Admin xác định location cho các bài có ngữ cảnh địa phương thật, ưu tiên các bài cluster/khu vực.
3. Sau khi có ít nhất một cohort bài liên kết hợp lệ + đủ inventory active, bật rail theo row-level data, không cần feature flag global.
4. Bài chưa chuẩn hóa vẫn hiển thị trải nghiệm hiện hữu: mục lục, bài liên quan, đọc nhiều, CTA, link danh mục.

### Phase G — Verification

- Migration dry-run trước; user tự chạy SQL production; sau khi báo chạy, chỉ read-only verify foreign keys/row counts.
- Typecheck + toàn bộ Vitest + build.
- Chrome thật:
  - bài gắn neighborhood/district có active properties;
  - bài có location nhưng không có inventory;
  - bài không gắn location;
  - 1440px desktop và 390px mobile;
  - kiểm URL canonical, single rail at breakpoint, no blank layout/duplication.
- Ghi verify-gate receipt, `graphify update .`, rồi commit/push nếu được yêu cầu.

## Phạm vi không làm

- Không AI recommendation mới.
- Không gắn sản phẩm thủ công từng bài.
- Không query/match theo keyword hoặc tên địa danh trong văn bản.
- Không đổi typography toàn site hay JSON-LD không liên quan.

## Kết quả kỳ vọng

Khi bài đã có location chuẩn: đọc bài → xem tin active của đúng entity/khu vực → mở canonical listing/detail → tiếp tục khám phá.

Khi bài không có location chuẩn: không “cố gợi ý”; giữ hành trình nội dung/news hiện hữu để tránh liên kết sai.
