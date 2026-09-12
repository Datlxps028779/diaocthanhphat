# Chợ Nhà Việt — Audit brief và roadmap triển khai cho AI Codex

## Mục đích tài liệu

Đọc toàn bộ tài liệu này trước khi phân tích hoặc chỉnh sửa codebase Chợ Nhà Việt.

Mục tiêu không phải làm website đẹp hơn một cách chung chung. Mục tiêu là xác định những việc quan trọng nhất để Chợ Nhà Việt tiến từ một website BĐS có khả năng tạo lead thành một marketplace BĐS có dữ liệu đáng tin, người mua muốn quay lại, người bán muốn đăng tin và hệ thống có thể scale.

Codex phải audit lại codebase và đối chiếu với các phát hiện trong tài liệu này. Không được mặc định các nhận định dưới đây đều đúng ở thời điểm hiện tại. Mỗi kết luận mới phải có bằng chứng từ code, database schema, API, test hoặc môi trường chạy thật.

---

## 1. Bối cảnh và mục tiêu sản phẩm

Chợ Nhà Việt đang tập trung vào Bình Dương và các khu vực lân cận như Bình Phước, Đồng Nai và TP. Hồ Chí Minh.

Mục tiêu dài hạn:

- Người mua tìm đúng BĐS nhanh.
- Người mua có đủ thông tin để so sánh và liên hệ.
- Người bán đăng tin hoàn chỉnh mà không cần hướng dẫn trực tiếp.
- Tin đăng có chất lượng và được kiểm duyệt.
- Người dùng quay lại nhờ lưu tin, lưu nhu cầu và nhận cảnh báo.
- Môi giới có công cụ quản lý tin, lead và thương hiệu cá nhân.
- Dữ liệu BĐS có thể dùng cho search, SEO, AI và phân tích giá.
- Nền tảng tạo được doanh thu mà không phá trải nghiệm người dùng.
- Kiến trúc đủ tốt để mở rộng trong 3–5 năm.

Funnel cần tối ưu:

`Traffic → Landing → Search → View Listing → Trust → Contact → Lead → Sale → Return`

---

## 2. Kết luận hiện trạng từ audit công khai

Mốc kiểm tra: 03/09/2026.

Đã kiểm tra các trang công khai:

- Trang chủ.
- Danh sách mua bán.
- Trang chi tiết BĐS.
- Tìm kiếm theo từ khóa.
- Bộ lọc khu vực, loại BĐS, giá, diện tích và pháp lý.
- So sánh BĐS.
- Định giá BĐS.
- Dữ liệu giá.
- Trang khu vực.
- Khu dân cư.
- Dự án.
- Tin tức và bài viết chi tiết.
- Đăng nhập, đăng ký và điểm bắt đầu luồng đăng tin.
- Metadata, canonical, JSON-LD, ảnh, form và cấu trúc URL.

Không đăng nhập, không gửi lead thật, không upload file, không khai thác bảo mật.

### Cấp độ hiện tại

Chợ Nhà Việt hiện là:

> Website BĐS có dữ liệu và khả năng tạo lead.

Chưa đạt cấp độ marketplace BĐS lớn vì còn thiếu:

1. Trust và cơ chế xác minh đủ rõ.
2. Seller Center và công cụ cho môi giới.
3. Thanh khoản dữ liệu đủ lớn và ổn định.
4. Chuẩn dữ liệu listing thống nhất.
5. Saved Search, alert và cơ chế retention.
6. Hệ thống moderation, chống trùng và chống gian lận.

### Điểm mạnh đã quan sát được

- Có danh sách mua bán và cho thuê.
- Có bộ lọc tương đối đầy đủ.
- Có giá/m² trên card và trang chi tiết.
- Có bản đồ, ngày đăng, ngày cập nhật và lượt xem.
- Có form tư vấn, gọi lại và hiện số điện thoại.
- Có so sánh tối đa 3 BĐS.
- Có công cụ định giá hoạt động với dữ liệu mẫu.
- Có trang dữ liệu giá.
- Có landing page khu vực và khu dân cư.
- Có nội dung tin tức, bài viết pháp lý và hạ tầng.
- Có trợ lý AI tìm BĐS.
- Có JSON-LD cho Organization/RealEstateAgent, WebSite, RealEstateListing, Breadcrumb, FAQ và NewsArticle.

---

## 3. Những bằng chứng quan trọng cần Codex kiểm tra lại

### 3.1. Dữ liệu listing chưa thống nhất

Tin mẫu:

`/mua-ban/binh-duong/dau-tieng/ban-dat-long-hoa-dau-tieng-binh-duong-1400m-san-800m-tho-cu-2-mat-tien-ngan-hang-3y3t-pr1016`

Quan sát được:

- Tiêu đề ghi 1.400m².
- Phần thông tin chi tiết ghi 1.447m².
- Mô tả ghi 1.400m².
- JSON-LD dùng `floorSize` với giá trị 1.447.
- Tiêu đề ghi 800m² thổ cư nhưng bảng thông tin chính chỉ hiển thị “Sổ hồng”.

Tác động:

- Người mua nghi ngờ tin đăng.
- Giá/m² có thể bị hiểu sai.
- Google và AI nhận các giá trị khác nhau.
- Khó xây price index hoặc valuation đáng tin.

Codex cần truy ngược xem dữ liệu sai phát sinh ở đâu: database, API serializer, content editor, slug generator, JSON-LD hay frontend formatter.

### 3.2. Địa danh cũ và mới đang trộn lẫn

Quan sát được:

- Website vẫn dùng Bình Dương trong title, URL và nội dung.
- Một số trang đồng thời ghi Bình Dương đã sáp nhập vào TP. Hồ Chí Minh.
- Tin chi tiết hiển thị dạng: “Xã Long Hòa, Thành phố Hồ Chí Minh, Dầu Tiếng, Bình Dương”.
- Một listing có tiêu đề “Đất Tân Khai – TP. Đồng Nai” nhưng vị trí hiển thị là Hớn Quản, Bình Phước.

Tác động:

- Khó tìm kiếm theo địa danh.
- Dễ tạo dữ liệu sai cho người mua.
- URL, breadcrumb, schema và nội dung không cùng một taxonomy.

Codex cần tìm toàn bộ location model, alias, mapping tỉnh/huyện/xã và cách sinh URL.

### 3.3. Trang dự án có số liệu mâu thuẫn

Trang `/du-an` hiển thị:

- “50+ Dự án”.
- “4 Tỉnh thành”.
- “1.200+ Khách hàng”.
- “98% Bàn giao đúng hạn”.
- Nhưng danh sách bên dưới ghi “Hiển thị 0 dự án — Dữ liệu đang cập nhật”.

Tác động: mất niềm tin, đặc biệt với người đang tìm dự án để đầu tư.

Codex cần kiểm tra nguồn của các số liệu này. Nếu chưa có dữ liệu thực, phải loại bỏ hoặc chuyển thành nội dung có điều kiện.

### 3.4. Trust chưa được chứng minh trên giao diện

Homepage có các thông điệp như:

- “Thông tin minh bạch”.
- “Mọi thông tin BĐS đều được xác thực và kiểm duyệt kỹ lưỡng”.
- “Pháp lý an toàn”.

Nhưng trên listing chưa thấy đầy đủ:

- Ai xác minh.
- Xác minh ngày nào.
- Xác minh giấy tờ nào.
- Xác minh vị trí hay chỉ xác minh số điện thoại.
- Tin có lịch sử chỉnh sửa hay không.
- Có người bán đã xác minh hay chưa.
- Có nút báo tin sai rõ ràng hay không.

Codex cần tìm moderation model, verification status, audit log và UI tương ứng.

### 3.5. Người bán chưa có trải nghiệm marketplace hoàn chỉnh

Truy cập `/dang-tin` khi chưa đăng nhập chỉ hiển thị yêu cầu đăng nhập.

Form đăng ký quan sát được có:

- Họ và tên.
- Số điện thoại.
- Email.
- Mật khẩu.

Chưa kiểm tra được:

- Lưu nháp.
- Upload ảnh.
- Preview.
- Validation nội dung.
- Kiểm duyệt.
- Sửa tin.
- Gia hạn.
- Lead dashboard.
- Analytics.
- Đẩy tin.
- Profile môi giới.

Đây là nhóm chức năng ưu tiên cao vì không có seller thì marketplace không có inventory.

### 3.6. Thanh khoản hiện còn thấp

Quan sát được:

- Website công bố 46 tin bán đang hoạt động.
- Trang khu vực Bình Dương hiển thị 23 tin bán.
- Tìm kiếm “Dầu Tiếng” trả về 2 tin.
- Trang dự án hiển thị 0 dự án.
- Dữ liệu giá dùng mẫu nhỏ, ví dụ Bình Dương 18 tin và Lê Phong 3 có 4 tin.

Không được suy diễn traffic hoặc doanh thu từ các con số này. Tuy nhiên đây là bằng chứng rằng cần ưu tiên liquidity tại một số khu vực trước khi mở rộng toàn quốc.

### 3.7. Rủi ro performance từ hình ảnh

Homepage quan sát được:

- 138 ảnh.
- 135 ảnh lazy-load.
- 3 ảnh tải ngay.
- Không có ảnh nào có `srcset`.
- Không có ảnh nào có thuộc tính width/height.

Tác động tiềm ẩn:

- Tải ảnh lớn trên mobile.
- Tăng request và bộ nhớ.
- Tăng CLS.
- Chậm LCP.
- Tốn chi phí CDN/storage khi scale.

Codex cần đo thật bằng Lighthouse, WebPageTest hoặc công cụ tương đương; không chỉ sửa theo cảm tính.

### 3.8. Form lead khai báo GET

Form tư vấn trên trang chi tiết được quan sát với:

`method="get"`

Các trường gồm:

- Họ tên.
- Số điện thoại.
- Ngân sách.
- Nội dung tư vấn.

Nếu form không được JavaScript chặn hoàn toàn, dữ liệu có thể đi vào URL, browser history, log hoặc referrer.

Codex cần kiểm tra cả frontend handler lẫn request thực tế. Nếu còn GET, chuyển sang POST và bảo vệ server-side.

### 3.9. SEO và structured data

Điểm tốt:

- Có canonical.
- Có robots meta.
- Có breadcrumb.
- Có WebSite và SearchAction.
- Có listing schema.
- Có NewsArticle.
- Có FAQ.

Vấn đề cần kiểm tra:

- Query search/filter đang `noindex, follow`.
- Cần phân biệt query rác và landing page có giá trị.
- `floorSize` không phù hợp để biểu diễn diện tích thửa đất.
- Entity chính đang thiên về `RealEstateAgent`, trong khi sản phẩm định vị là marketplace.
- Listing chưa thể hiện seller/provider đầy đủ.
- Một số trang có thời điểm render nội dung chậm.
- Một số ảnh alt rỗng.
- Nhiều page không có landmark `<main>`.

### 3.10. AI assistant đã có nhưng chưa kiểm chứng chất lượng

Trợ lý AI có:

- Nhu cầu mẫu.
- Textarea nhập nhu cầu.
- Gợi ý theo khu vực, giá và pháp lý.
- Kết nối tư vấn viên.

Chưa gửi câu hỏi thật trong audit. Codex cần xác định:

- AI lấy dữ liệu từ đâu.
- Có filter thật hay chỉ trả lời bằng text.
- Có dẫn link listing không.
- Có nói rõ thời điểm cập nhật không.
- Có tránh bịa pháp lý/giá không.
- Có log và bảo vệ dữ liệu người dùng không.

---

## 4. Việc quan trọng nhất cần làm trước

### P0 — Critical

Chưa có bằng chứng P0 trực tiếp trong audit công khai.

Tuy nhiên khi audit codebase, nếu phát hiện các vấn đề sau thì nâng lên P0:

- Lead hoặc thông tin cá nhân bị lộ công khai.
- Seller có thể sửa/xóa tin của người khác.
- Upload file cho phép thực thi mã.
- Mất dữ liệu listing/user.
- Thanh toán hoặc quyền truy cập bị sai.

### P1 — High

Đây là nhóm phải làm trước mọi tính năng tăng trưởng:

1. Chuẩn hóa dữ liệu listing.
2. Chuẩn hóa địa danh và taxonomy.
3. Sửa trang dự án có số liệu mâu thuẫn.
4. Chuyển form lead sang POST, validate và chống spam.
5. Xây trạng thái xác minh tin/người bán.
6. Hoàn thiện luồng đăng tin có lưu nháp và preview.
7. Tối ưu ảnh và đo Core Web Vitals.
8. Xây seller dashboard tối thiểu.
9. Thêm seller profile và thông tin người tư vấn rõ ràng.
10. Thêm Saved Search và alert.
11. Kiểm tra quyền truy cập theo user/seller/listing.
12. Đo funnel từ xem tin đến lead.

### P2 — Medium

- Hoàn thiện schema semantic.
- Tách Organization/Marketplace/Agent đúng vai trò.
- Bổ sung author/reviewer cho nội dung pháp lý.
- Cải thiện filter bằng autocomplete.
- Thêm price history.
- Thêm nút báo tin sai.
- Xây landing page địa phương có điều kiện index.
- Chuẩn hóa internal link về canonical URL.
- Thêm bộ dữ liệu so sánh theo khu vực.

### P3 — Low

- Tối ưu footer và copywriting.
- Đổi logo JPG sang định dạng phù hợp.
- Làm thêm animation hoặc visual polish.
- Mở rộng các dịch vụ phụ trợ.
- Xây app native khi web funnel chưa ổn định.

---

## 5. Roadmap triển khai theo phase

## Phase 0 — Audit codebase và xác nhận hiện trạng

Thời gian: trước khi bắt đầu implementation.

Codex cần kiểm tra:

- Framework và entry points.
- Route structure.
- Database schema/migrations.
- API routes/server actions.
- Auth và phân quyền.
- Listing model.
- User/seller/agent model.
- Location model.
- Media/upload pipeline.
- Moderation.
- Lead flow.
- Search/filter.
- SEO metadata và JSON-LD.
- Analytics.
- Test hiện có.
- CI/CD và môi trường chạy.

### Output bắt buộc của Phase 0

1. Sơ đồ kiến trúc hiện tại.
2. Danh sách model và quan hệ dữ liệu.
3. Bảng route public/private.
4. Luồng request của listing, search, lead và đăng tin.
5. Danh sách vấn đề xác nhận được từ code.
6. Danh sách vấn đề chưa đủ dữ liệu.
7. Kế hoạch implementation có thứ tự.
8. Rủi ro migration và rollback.

Không được sửa code lớn trước khi hoàn thành Phase 0.

## Phase 1 — Fix dữ liệu, trust và rủi ro nền tảng

Thời gian mục tiêu: 0–30 ngày.

### Việc cần làm

- Chọn nguồn dữ liệu chuẩn cho từng field listing.
- Tách tổng diện tích, diện tích đất ở và diện tích sử dụng.
- Chuẩn hóa giá và giá/m².
- Chuẩn hóa location canonical và alias.
- Thêm trạng thái listing.
- Thêm `last_verified_at` và `verification_status`.
- Chuyển lead form sang POST.
- Validate server-side.
- Chống spam/rate limit.
- Kiểm tra quyền truy cập listing và lead.
- Sửa trang dự án để số liệu khớp dữ liệu thật.
- Thêm báo tin sai.
- Sửa JSON-LD diện tích đất.
- Tối ưu ảnh LCP và ảnh card.
- Thêm width/height hoặc aspect-ratio.

### Acceptance criteria

- Một listing chỉ có một giá trị chuẩn cho từng field.
- Title, card, detail, FAQ, metadata và schema lấy từ cùng nguồn.
- Không còn listing hiển thị địa danh mâu thuẫn.
- Không có PII trong URL khi gửi lead.
- Seller không thể đọc/sửa lead hoặc listing ngoài quyền.
- Trang dự án không còn hiển thị số liệu không có bằng chứng.
- Ảnh card có kích thước phù hợp và không gây layout shift rõ rệt.

## Phase 2 — Conversion và buyer experience

Thời gian mục tiêu: 30–60 ngày.

### Việc cần làm

- Seller profile trên trang chi tiết.
- Hiển thị trạng thái xác minh.
- CTA gọi/Zalo/form theo cùng một seller.
- Đặt lịch xem nhà.
- Câu hỏi liên hệ nhanh.
- Saved Search.
- Alert tin mới và giảm giá.
- Lịch sử giá.
- Filter autocomplete.
- Bản đồ danh sách.
- Calculator chi phí giao dịch.
- Gợi ý tin tương tự theo giá, diện tích, vị trí và loại BĐS.
- Event tracking cho funnel.

### Acceptance criteria

- Người mua tìm được listing theo địa điểm, giá, diện tích và pháp lý.
- Người mua biết rõ ai sẽ nhận lead.
- Người mua thấy tin đã xác minh gì.
- Người mua lưu được tin và nhu cầu.
- Team có dashboard view → CTA → lead.

## Phase 3 — Seller marketplace

Thời gian mục tiêu: 60–120 ngày.

### Việc cần làm

- Seller Center.
- Lưu nháp tự động.
- Wizard đăng tin.
- Upload nhiều ảnh.
- Kiểm tra ảnh lỗi/trùng.
- Preview.
- Quy trình chờ duyệt.
- Lý do từ chối.
- Sửa tin.
- Gia hạn/tạm ẩn.
- Analytics lượt xem, lưu, gọi và lead.
- Profile cá nhân/môi giới/doanh nghiệp.
- Quản lý nhiều listing.
- Chống tin trùng.
- Gắn listing với seller và property riêng biệt.

### Acceptance criteria

- Người bán bình thường hoàn thành một tin đầy đủ mà không cần nhân viên hướng dẫn.
- Seller biết chính xác tin đang ở trạng thái nào.
- Seller biết tin tạo ra bao nhiêu lượt xem và lead.
- Admin duyệt/sửa/ẩn tin được theo quyền.
- Tin trùng hoặc dữ liệu bất thường có cảnh báo.

## Phase 4 — Growth và monetization

Thời gian mục tiêu: 120–180 ngày.

Chỉ triển khai sau khi Phase 1–3 ổn định.

### Việc cần làm

- Featured listing.
- Đẩy tin.
- Gói xác minh trả phí.
- Gói dành cho môi giới.
- Lead package.
- Newsletter khu vực.
- Content hub theo địa phương.
- Landing page có điều kiện index.
- Báo cáo giá theo khu vực.
- Referral cho người mua và seller.
- Native content có gắn nhãn tài trợ.

### Nguyên tắc

- Không đặt quảng cáo che CTA.
- Không bán “xác minh” nếu không có quy trình xác minh thật.
- Không index landing page chỉ có vài tin và nội dung trùng.
- Không dùng số liệu doanh thu dự kiến nếu chưa có dữ liệu thử nghiệm.

## Phase 5 — Scale

Thời gian mục tiêu: sau 180 ngày.

### Việc cần làm

- Search engine chuyên dụng.
- Data warehouse.
- Fraud detection.
- Event-driven moderation.
- CDN/image processing pipeline.
- API đối tác.
- Billing/subscription.
- Monitoring và alerting.
- Phân quyền doanh nghiệp.
- Backup/restore và disaster recovery.
- Tối ưu database query và index.
- Hệ thống AI retrieval có grounding từ listing index.

---

## 6. Kiến trúc dữ liệu mục tiêu

Không nên gộp tài sản và tin đăng thành một bảng duy nhất.

### Các thực thể đề xuất

```text
User
Seller
Agent
Organization
Property
Listing
Location
Media
Verification
Lead
Favorite
SavedSearch
ViewEvent
PriceHistory
ModerationCase
Payment
Subscription
```

### Listing nên có tối thiểu

```text
listing_id
property_id
seller_id
canonical_url
transaction_type
property_type
title
description
price
currency
land_area
residential_area
usable_area
frontage
road_width
bedrooms
bathrooms
legal_status
location_id
latitude
longitude
verification_status
verified_fields
date_posted
date_modified
last_verified_at
date_expired
status
```

### Quy tắc dữ liệu

- Không lấy diện tích từ title để làm dữ liệu chính.
- Không để seller tự do nhập location dạng text nếu đã có taxonomy chuẩn.
- Không để JSON-LD tự format khác với UI.
- Không hiển thị “đã xác minh” nếu không có record verification.
- Không dùng dữ liệu mẫu nhỏ để kết luận thị trường rộng.

---

## 7. SEO/GEO/AIO target state

### SEO

- Mỗi listing có một canonical URL.
- Query rác `noindex`; landing page có giá trị được index có điều kiện.
- Trang địa phương có nội dung riêng, inventory thật và dữ liệu cập nhật.
- Có internal link từ tỉnh → huyện → xã → listing.
- Có sitemap được kiểm tra trong production.
- Có robots policy rõ.
- Có status code, redirect và 404 đúng.
- Có alt ảnh phù hợp.
- Có `<main>` và HTML semantic.

### JSON-LD

- Organization hoặc Marketplace phản ánh đúng vai trò pháp nhân.
- WebSite có SearchAction đúng endpoint.
- Listing có Offer, Place, geo, datePosted, dateModified và seller khi có dữ liệu.
- Diện tích đất dùng field semantic phù hợp, không dùng `floorSize` sai ngữ nghĩa.
- FAQ chỉ dùng khi câu hỏi và câu trả lời thực sự hiển thị trên trang.
- NewsArticle có author, publisher, datePublished, dateModified và nguồn.

### AI Search

AI phải có khả năng trả lời câu hỏi kiểu:

> Tìm đất dưới 2 tỷ ở Dầu Tiếng, có sổ hồng, diện tích trên 1.000m².

Kết quả phải:

- Lọc từ dữ liệu thật.
- Có link listing.
- Hiển thị ngày cập nhật.
- Nói rõ số lượng kết quả.
- Không bịa pháp lý hoặc giá thị trường.
- Phân biệt giá rao và giá giao dịch nếu hệ thống chưa có giá giao dịch.

---

## 8. Bảo mật và privacy cần audit

Chỉ kiểm tra an toàn, không khai thác phá hoại.

Codex cần kiểm tra:

- Auth flow.
- Authorization theo user/seller/listing/lead.
- IDOR bằng test account trong môi trường cho phép.
- Server-side validation.
- CSRF protection nếu dùng cookie session.
- XSS trong title, description, FAQ và content editor.
- Upload MIME/type/size/path.
- Rate limit lead, login, register và upload.
- Account enumeration.
- Password reset.
- Log PII.
- PII trong URL, analytics và error message.
- API response có trả thừa dữ liệu hay không.

Không được test bằng dữ liệu thật của người dùng.

---

## 9. Cách Codex cần làm việc

### Bước 1 — Đọc tài liệu

Đọc toàn bộ file này và các file hướng dẫn trong repository.

### Bước 2 — Audit codebase

Không bắt đầu bằng việc sửa giao diện. Trước hết phải xác định:

- Hệ thống đang chạy thế nào.
- Dữ liệu đi qua những đâu.
- Các phát hiện nào đúng.
- Các phát hiện nào đã được sửa.
- Các phát hiện nào chưa thể kiểm tra.

### Bước 3 — Lập plan

Plan phải ghi rõ:

- Task.
- File/module liên quan.
- Dependency.
- Rủi ro.
- Migration cần thiết.
- Test cần viết.
- Acceptance criteria.
- Thứ tự triển khai.

### Bước 4 — Chỉ triển khai sau khi plan rõ

Nếu task lớn, chia thành các PR/commit nhỏ theo Phase 1, Phase 2, Phase 3.

### Bước 5 — Verify

Sau mỗi phase phải kiểm tra:

- Unit test.
- Integration test.
- E2E test cho buyer/seller.
- SEO metadata.
- JSON-LD.
- Permission.
- Performance.
- Mobile thực tế.

---

## 10. Output Codex cần trả lại trước khi code

Codex phải trả lời theo cấu trúc sau:

### A. Current architecture

- Framework.
- App structure.
- Database.
- API.
- Auth.
- Search.
- Media.
- Deployment.

### B. Confirmed findings

Bảng gồm:

`Problem | Evidence in code | Impact | Priority | Proposed fix`

### C. Unverified findings

Ghi rõ:

`Chưa đủ dữ liệu để kết luận.`

Không tự suy diễn.

### D. Top 10 implementation priorities

Sắp xếp theo:

`Business value → User value → Trust → Conversion → SEO/GEO → Technical quality → Scalability`

### E. Phase roadmap

Phải có:

- Phase.
- Mục tiêu.
- Task.
- Files/modules.
- Data migration.
- Test plan.
- Acceptance criteria.
- Rủi ro.

### F. First implementation slice

Chọn một nhóm thay đổi nhỏ nhưng tạo giá trị rõ, ví dụ:

- Chuẩn hóa listing data.
- Sửa form lead.
- Sửa trust status.
- Viết test regression.

Không bắt đầu bằng việc làm lại toàn bộ frontend.

---

## 11. Definition of Done cấp sản phẩm

Chợ Nhà Việt chỉ nên xem là đã tiến lên marketplace khi đạt các điều kiện sau:

- Người mua tìm được listing theo nhu cầu chính.
- Listing có dữ liệu nhất quán ở mọi nơi.
- Người mua biết tin nào đã xác minh và xác minh gì.
- Seller hoàn thành tin mà không cần hỗ trợ trực tiếp.
- Seller quản lý được nhiều tin và thấy lead.
- Admin duyệt, ẩn, sửa và xử lý tin sai được.
- Có Saved Search và alert.
- Có đo funnel từ view đến lead.
- Không có PII trong URL lead.
- Có test phân quyền.
- Có số liệu performance trước và sau tối ưu.
- SEO page và schema phản ánh đúng dữ liệu thật.
- AI assistant truy xuất listing có căn cứ, không bịa.
- Mô hình monetization không phá trust và conversion.

---

## 12. Kết luận dành cho Codex

Ưu tiên hiện tại không phải mở rộng thêm thật nhiều page hay thêm chatbot.

Thứ tự đúng là:

> Dữ liệu đúng → Trust rõ → Seller đăng tin được → Buyer tìm và liên hệ dễ → Đo funnel → Giữ chân → Monetization → Scale.

Nếu kiến trúc hiện tại không đáp ứng được các bước trên, Codex phải nói thẳng phần nào cần refactor. Không cố bảo vệ code cũ và không triển khai tính năng mới trên nền dữ liệu chưa chuẩn.

