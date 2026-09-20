# TODO kỹ thuật — locality và Search Visibility

**Ngày rà soát:** 2026-09-19
**Phạm vi:** source đang dirty trên `feat/locality-report-phase` và bằng chứng browser local. Đây là checklist nội bộ, **không** phải kết luận production. Vòng source pass đã xử lý các mục P1 và hai contract P2; các mục còn lại cần runtime/đo tải trước khi mở rộng.

## P1 — lỗi hành vi hoặc ngưỡng hỏng cần xử lý trước rollout

- [x] **Giữ semantics relevance khi tìm kiếm có scope địa phương.** `src/lib/api/properties.ts`: locality search truyền scope vào RPC ranking, không còn rơi về `ilike` + `created_at`; giữ `typeIds=[]` là match-zero, price band theo VND và pagination/tie-break. Migration RPC mở rộng nằm tại `supabase/migrations/20261012000000_scoped_property_ranking.sql`, chưa áp production.
- [x] **Đo dung lượng dữ liệu thật, rồi giải quyết trần 5.000 row toàn site nếu có khả năng chạm ngưỡng.** `src/lib/server/localitySnapshot.ts`: snapshot đọc properties theo từng `area_id`, nên fixture 6.000 row toàn site vẫn phục vụ từng area trong bounded cap; completeness/deadline/fail-closed vẫn giữ nguyên. Production count chưa được đo vì chưa chạy read-only query production.

## P2 — lỗi browser đã quan sát, cần chẩn đoán riêng

- [ ] **RPC tăng lượt xem bài viết trả 401.** Chrome local mở bài viết hợp lệ nhận HTTP 401 từ `increment_news_views`; response body là PostgreSQL `42501` (permission denied). Source đã bỏ fallback UPDATE trái quyền. Chờ user tự áp/kiểm tra migration và grant production; chưa sửa ACL từ phỏng đoán. **Đạt khi:** browser không còn request 401 sau runtime verification.
- [x] **Trang chi tiết bài viết tràn ngang ở viewport 390px.** Chrome thật đã kiểm tra bài viết hợp lệ ở 390px và 320px: `body.scrollWidth === innerWidth`, `document.documentElement.scrollWidth === innerWidth`; carousel nội bộ vẫn đổi `scrollLeft`. Containment hẹp đã thêm tại `src/components/discovery/PropertyDiscoveryRail.tsx`. Component riêng chưa có route live để đo trực tiếp trong preview.

## P2 — contract dễ lệch, có bằng chứng source nhưng chưa chứng minh sự cố live

- [x] **Hợp nhất bounded reader taxonomy trong middleware và server.** `src/lib/localityRequest.ts` vẫn là reader Edge độc lập để giữ HEAD facet và không kéo server-only module, nhưng đã siết cùng invariants: Content-Range exact, row-end validation, max rows và final probe drift; regression malformed header/truncated response pass. `localitySnapshot` dùng bounded reader chung cho server.
- [x] **Dùng một bảng khoảng giá cho report và truy vấn.** `src/lib/localityPageContext.ts` nay dẫn xuất `PRICE_BANDS`, `priceBandFromVnd` và band IDs từ `src/lib/localityListingScope.ts`; query và report dùng chung ngưỡng, giá 0 bị loại và cận trên exclusive. Bộ test locality band kiểm tra 0, 1, 2, 5 tỷ và các ranh giới đơn vị tỷ/triệu.

## P3 — giảm tải sau khi khóa tính đúng

- [x] `src/lib/server/localityPage.tsx`: news và listings của landing nay tải song song khi độc lập; report vẫn không gọi listings. Giữ nguyên quality gate `news.indexable`.
- [x] `src/components/PropertyTimeline.tsx`: chỉ polling/refetch focus cho ngày hiện tại; ngày lịch sử dùng `staleTime` 5 phút, không polling và không refetch khi focus. Footer hiển thị rõ trạng thái lịch sử không tự động cập nhật.
- [ ] `src/lib/localityPageData.ts` đã lấy facet counts từ `report.distributions` dùng chung, không gọi lại `getLocalityReport` cho từng link; `src/lib/localitySitemapGate.ts` vẫn giữ full evaluation cho từng candidate để bảo toàn quality gate/lastModified. Chỉ tiếp tục tối ưu sitemap khi có số đo CPU/TTFB.
- [x] `src/lib/server/searchVisibilityService.ts:151-160`: các source reads độc lập đã chạy qua `Promise.all`; locality và locality-news cũng đọc song song trước reconcile, đồng thời vẫn fail-closed khi bất kỳ nguồn nào incomplete.

## Đã khép — không mở lại nếu không có regression

- [x] Slug bài viết malformed trả HTTP **404 thật** ở middleware trước database; canonical và UUID legacy vẫn đi qua. Chrome local xác nhận, route/page tests có guard.
- [x] Locality-news structured + narrative được merge/dedupe trước threshold; snapshot unavailable khác tập rỗng; sitemap lấy lastmod toàn matched set; Search Visibility locality-news dùng entity `news` và namespace `locality_news:`.
- [x] Cron scheduled đã có hai lượt 202/202 thành công theo bằng chứng trước đó. Không chạy manual sync lần ba để lặp xác minh.

## Gate trước rollout (không tự chạy)

- [ ] Runtime PostgreSQL RPC reconcile trên DB cô lập: ACL, rollback, stale fencing, canonical conflict. SQL-text/mock tests không thay thế bằng chứng này.
- [ ] Complete candidate/retirement manifest production, thay cho `BLOCKED_NO_COMPLETE_MANIFEST`.
- [ ] Admin flow cần đăng nhập và kiểm tra sau deploy; Google indexing/Search Console chưa được kiểm trong pass local.
- [ ] User tự áp migration production, xác nhận RPC tồn tại rồi mới deploy caller; commit/push cần cho phép riêng từng lần.

**Bằng chứng hiện có:** locality contract tests 121/121 pass; full Vitest 259 files pass, 2.318 tests pass, 1 skipped; typecheck và `git diff --check` sạch; verify receipt đã ghi. Chrome thật viewport 390px/320px xác nhận bài hợp lệ 200, hard 404, body/document không tràn ngang và carousel nội bộ vẫn scroll. View-counter vẫn 401/42501 do runtime permission chưa được áp/xác nhận. Không kết luận các gate runtime này đã xảy ra hoặc đã được sửa trên production.
