# B1 Audit — Search nội bộ

> Ngày: **2026-09-12**  
> Trạng thái: **AUDIT HOÀN TẤT — CHƯA SỬA CODE**  
> Phạm vi: Search Product nội bộ, bộ lọc, ranking, pagination, public-only, canonical link.  
> Ngoài phạm vi: Search Visibility/Search Console và RAG.

## Kết luận

Nền tảng Search hiện có và test thuần đang chạy tốt, nhưng có **2 lỗi logic cần sửa trước khi nghiệm thu B1** và **1 điểm cần quyết định policy**:

1. **Giá khi tìm trên `/danh-sach` (mixed sale + rental) dùng sai cột.**
2. **Nhóm loại BĐS (`typeIds`) làm mất sort mà người dùng đã chọn.**
3. **Link Product hiện dùng canonical builder trực tiếp ở card, nhưng các đường điều hướng khác vẫn có thể đi qua `/bat-dong-san/...` legacy và middleware redirect; cần kiểm kê/chuẩn hóa sau khi chốt policy.**

## Luồng đã xác nhận

```text
ListingsPage
→ parse URL / parseSearchIntent
→ filters
→ getAllProperties / getRankedPropertyMatches
→ search_property_matches hoặc PostgREST fallback
→ chỉ lấy properties.is_active = true
→ render card/map
```

Các điểm chính:

- `src/screens/ListingsPage.tsx`
- `src/lib/aiSearch.ts`
- `src/lib/api/properties.ts`
- `src/lib/router.ts`
- `src/lib/productPath.ts`
- `supabase/migrations/20260903040000_explainable_organic_ranking.sql`
- `src/lib/rankingPolicy.ts`

## Findings

### B1-01 — Mixed listing price filter sai semantics

**Vị trí:** `src/lib/api/properties.ts:80–82`  
**Mức độ:** High — ảnh hưởng trực tiếp kết quả Search.

Hiện tại:

- `listingType = cho_thue` → dùng `price_per_month`.
- Mọi trường hợp khác, gồm cả không chọn loại giao dịch (`/danh-sach`) → dùng `price`.

Trong khi UI `/danh-sach` có thể trả cả mua bán và cho thuê, và `ListingsPage` vẫn gửi `minPrice/maxPrice`. Vì vậy tin cho thuê có thể bị lọc theo cột `price` thay vì `price_per_month`, tạo kết quả sai hoặc thiếu.

**Test hiện có:** chỉ xác nhận mặc định không có `listingType` dùng `price`; chưa có test mixed sale/rental.

**Không tự sửa vì cần chốt policy:**

- **B1-01-A — Khuyến nghị:** mixed search dùng predicate theo từng `listing_type`: mua bán lọc `price`, cho thuê lọc `price_per_month`; UI hiển thị rõ đơn vị khi mixed.
- **B1-01-B:** Khi chưa chọn mua bán/cho thuê, không cho áp dụng bộ lọc giá; yêu cầu chọn loại giao dịch.
- **B1-01-C:** `/danh-sach` chỉ là route tổng hợp, nhưng tách thành hai query/nhóm kết quả theo đơn vị giá.

### B1-02 — Grouped property type làm mất sort

**Vị trí:** `src/lib/api/properties.ts:173–182`  
**Mức độ:** Medium/High — ảnh hưởng Search có intent loại nhóm.

Khi `filters.typeIds` có nhiều ID, code bỏ qua RPC `search_property_matches` và dùng PostgREST fallback. Nhánh fallback luôn:

```text
order(created_at DESC).order(id DESC)
```

Do đó các lựa chọn `price_asc`, `price_desc`, `views` hoặc `relevance` không còn được tôn trọng. Trường hợp dễ gặp: người dùng tìm “nhà Dĩ An” rồi chọn sort giá.

**Đề xuất:** B1-02-A — giữ fallback nhưng dùng chung hàm sort với query thường; với `relevance`, ghi rõ không có text rank SQL hoặc bổ sung RPC hỗ trợ nhiều type IDs trong migration riêng. Không mở rộng RAG.

### B1-03 — Legacy Product path còn có thể tạo redirect phụ

**Vị trí liên quan:**

- `src/lib/router.ts:115`
- `src/lib/productPath.ts`
- `middleware.ts:92–126`
- `src/screens/ListingsPage.tsx:1118,1161` (đã dùng `buildProductPath`)

Các card chính trong Listings đã dùng `buildProductPath`, nhưng các đường `onNavigate({ name: 'property' })` đi qua `pageToHref`, vốn vẫn sinh `/bat-dong-san/{slug|id}` rồi chờ middleware redirect nếu có canonical Product path.

**Mức độ:** Medium — không làm sai kết quả, nhưng tạo thêm hop và có thể khác behavior khi Product thiếu `public_code`.

**Đề xuất:** B1-03-A — đổi `Page.property`/`pageToHref` để nhận source đủ canonical và dùng `buildProductPath`; giữ legacy route chỉ cho backward compatibility.  
**Không nên:** xóa legacy route ngay, vì có thể còn link cũ đã được chia sẻ/index.

## Điểm đã đạt

- Public query luôn `.eq('is_active', true)` ở query thường, RPC và hydrate detail.
- Keyword được sanitize trước PostgREST `.or()`.
- Ranking SQL có bounded limit/offset và tie-breaker deterministic.
- Organic ranking không cộng `featured`, `hot`, `verified`, `views` vào relevance score trong migration hiện tại.
- Search intent có test cho location/type/price/area/bedroom/legal/direction/loan.
- Pagination có xử lý trang vượt tổng và test trạng thái search.
- Focused B1 tests: **115 passed**.

## Chưa thể kết luận từ local test

- Phân bố thực tế sale/rental và giá trong production.
- RPC production `search_property_matches` đã đúng phiên bản/migration hay chưa.
- Search result thực tế với dữ liệu production và các route/role đang hoạt động.
- Search Visibility registry; phần này thuộc B2.

## Quyết định chờ user duyệt

Để triển khai B1, cần chọn policy cho B1-01:

1. **B1-01-A + B1-02-A + B1-03-A — khuyến nghị:** sửa đúng semantics mixed price, giữ sort, chuẩn hóa navigation về canonical builder.
2. **Chỉ B1-02-A + B1-03-A:** tạm khóa mixed price cho đến khi có policy nghiệp vụ.
3. **Chỉ audit tiếp, chưa sửa code:** yêu cầu user chạy production read-only Search audit trước.

## Re-audit sau yêu cầu duyệt B1-A — 2026-09-12

- Đã rà lại luồng `ListingsPage → filters → API/RPC → hydrate → card/map`.
- Không phát hiện thêm lỗi ngoài B1-01, B1-02 và B1-03.
- Ba điểm trên vẫn là vấn đề tồn tại trong code hiện tại; vì vậy chưa thể kết luận “không còn lỗi” và chưa đánh dấu B1-A là đã triển khai.
- Phương án B1-A vẫn là phương án kỹ thuật phù hợp nhất, với điều kiện phải viết test regression cho mixed price, grouped-type sort và canonical navigation trước khi sửa.
- Re-audit tests: **115 passed**; các test hiện có chưa bao phủ đầy đủ ba case nêu trên.

## B1-A implementation — 2026-09-12

**Trạng thái:** IMPLEMENTED — chờ runtime verification.

Đã sửa trong write-set B1-A:

- `src/lib/api/properties.ts`
  - Mixed `/danh-sach` áp dụng giá theo đúng loại tin: `price` cho `mua_ban`, `price_per_month` cho `cho_thue`.
  - Nhánh `typeIds` dùng chung policy sort với query thường (`price_asc`, `price_desc`, `views`, `newest`).
  - Với `relevance` trong fallback nhiều `typeIds`, giữ thứ tự mới nhất xác định vì không có text rank tương đương RPC đơn loại.
- `src/lib/router.ts`
  - `Page.property` nhận `canonicalPath` tùy chọn; vẫn giữ fallback legacy để backward compatibility.
- `src/screens/ListingsPage.tsx`, `src/components/PropertyMap.tsx`, `src/screens/RegionsPage.tsx`, `src/components/AiSearchChat.tsx`
  - Các luồng đã có đủ source data truyền canonical Product path trực tiếp, giảm redirect trung gian.
- Regression tests:
  - mixed price predicate;
  - explicit sale/rental price column;
  - grouped-type sort;
  - canonical property navigation.

### Scope lock

- Không sửa RAG, không rebuild/backfill `rag_chunks`.
- Không sửa News publication permission/error contract trong B1-A; audit News được ghi nhận riêng để xin approval slice tiếp theo.
- Không xóa legacy Product route/middleware redirect.
