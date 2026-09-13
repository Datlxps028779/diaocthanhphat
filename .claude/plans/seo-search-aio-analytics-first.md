# Priority Plan — SEO + Search + AIO + Analytics trước RAG

> Trạng thái: `APPROVED SCOPE — RAG DEFERRED`
>
> Ngày chốt phạm vi: 2026-09-12
>
> Mục tiêu: hoàn thiện các lớp public SEO, Search, AIO runtime và analytics
> dựa trên hệ thống hiện có trước khi triển khai hoặc mở rộng RAG.

## 0. Scope lock

### Được làm trước

1. SEO public consistency.
2. Search nội bộ và Search Visibility/Search Console evidence.
3. AIO runtime grounded trên dữ liệu live/public hiện có, không rebuild RAG.
4. Analytics/GA4, event taxonomy và báo cáo hành vi.
5. Cross-system verification, documentation và training runbook.

### Tạm dừng

- Không triển khai hoặc mở rộng `refresh_rag_index`.
- Không backfill/full rebuild `rag_chunks`.
- Không thêm `knowledge_type` chỉ để phục vụ RAG trong batch này.
- Không mở rộng `aiIndexTargetsForContent()` hoặc tạo RAG queue mới.
- Không coi chunk count là acceptance criteria của batch này.

RAG chỉ được mở lại bằng quyết định riêng của user sau khi các gate SEO/Search/AIO/
Analytics đạt.

## Execution handoff — 2026-09-13

### Nguyên tắc đã chốt

- GA4 property đã được owner cấu hình trong Vercel; **không tự đổi GA4 ID**.
- `NEXT_PUBLIC_GA_ID` trên Vercel là nguồn ưu tiên. Site setting chỉ là fallback;
  fallback cuối giữ mã hiện hữu để không đổi property ngoài ý muốn.
- Không chuyển sang AI nội bộ/RAG trong slice hiện tại. RAG vẫn deferred.
- Không tự commit/push; push cần owner cho phép riêng.

### Đã hoàn thành

- **P0 permission cleanup:** user đã chạy dry-run, migration và verify; profile
  mục tiêu vẫn role `user`, assignment stale còn `0`, non-staff assignment rows `0`.
- **P1 public SEO sample:** production Chrome đã kiểm tra 6 surface; 6/6 HTTP
  `200`, canonical/og:url đúng, `index, follow`, JSON-LD đúng loại; sitemap `178/178`
  unique và image sitemap `136/136` unique.
- **P3 AIO:** đã đóng; runtime dùng live/public source, không gọi
  `match_rag_chunks` hoặc `refresh_rag_index`; RAG không nằm trong bước tiếp theo.
- **P4 GA4 code boundary:** đã sửa để tôn trọng Vercel environment ID, giữ Ads/
  consent/private-path boundary; full Vitest `200 files / 1.557 tests`, typecheck,
  production build, Chrome local verify và verify receipt đều đạt.
- **Production baseline:** trước deploy, Chrome production vẫn thấy
  `G-SKF33YNMZZ`; không thấy `G-XK14HMKSK9`. Đây là trạng thái chưa deploy, không
  phải lỗi runtime production.

### Các bước tiếp theo — chỉ làm theo thứ tự này

1. **Deploy source hiện tại**; không đổi site setting hoặc GA4 property trên Vercel.
2. **Sau deploy, mở production bằng Chrome thật** và kiểm tra:
   - GA4 ID thực tế trùng `NEXT_PUBLIC_GA_ID` owner đã cấu hình;
   - không có GA4 ID thứ hai;
   - consent unset không tải Google tag;
   - consent granted tải đúng tag;
   - `/quantrihethong` và `/noi-bo` không gửi pageview/tracking.
3. **GA4 Data API diagnostic/report** nếu đã cấu hình đủ server secrets:
   `GOOGLE_ANALYTICS_CLIENT_EMAIL`, `GOOGLE_ANALYTICS_PRIVATE_KEY`,
   `GOOGLE_ANALYTICS_PROPERTY_ID`.
4. **Đối chiếu report** với event taxonomy và date range; chỉ khi có evidence
   production mới đánh dấu Gate P4 hoàn tất.
5. Sau Gate P4 mới mở P5 cross-system verification. Không mở RAG trước P5.

### Stop condition

Dừng và báo owner nếu chưa có deployment hoặc chưa có production evidence. Không tự
đổi GA4 ID, không tự chạy SQL production, không tự mở AI/RAG.

## 1. Nguyên tắc không chồng chéo

- Giữ source tables, public routes, `seo_freshness_jobs` và Search Visibility
  hiện có; không tạo bản sao chức năng.
- Mọi claim phải phân biệt:
  - public route đã render;
  - Search Visibility eligible;
  - Google evidence;
  - AIO runtime response;
  - RAG projection (đang deferred).
- User/staff chỉ nhập dữ liệu nghiệp vụ; SEO kỹ thuật do hệ thống sinh.
- Downstream lỗi không làm mất dữ liệu; hiển thị degraded/pending và evidence.
- Mỗi slice có write-set, dependency, rollback, tests và verify receipt.

## 2. P0 — Baseline và scope audit

- [ ] Ghi production evidence đầy đủ cho current SEO/Search/AIO/Analytics.
- [ ] Đối chiếu route → canonical → sitemap → Search Visibility.
- [ ] Đối chiếu internal search result → canonical Product route.
- [ ] Kiểm tra cấu hình GA4 và trạng thái báo cáo server-side.
- [ ] Kiểm tra AIO runtime dùng nguồn live nào, privacy boundary nào.
- [ ] Ghi rõ mọi đường RAG hiện tại là deferred, không sửa trong slice này.

**Gate P0:** Có current-state map và không còn nhầm RAG với AIO runtime.

## 3. P1 — SEO public consistency

### Technical SEO

- [ ] Canonical origin/path thống nhất cho Product, News, Area, Neighborhood,
      Category và Managed Page.
- [ ] Metadata/JSON-LD sinh từ canonical source, không lấy stored schema làm
      nguồn sự thật.
- [ ] Sitemap/image sitemap/robots không chứa preview, query/hash hoặc URL sai.
- [ ] Slug malformed, duplicate canonical và stale URL có audit rõ.
- [ ] Internal links dùng path an toàn, không lẫn absolute/relative ngoài policy.

### Content quality

- [ ] Lập danh sách News thiếu internal link/citation/FAQ/keyword theo measurement.
- [ ] Tách lỗi kỹ thuật khỏi nội dung cần biên tập thủ công.
- [ ] Không tự rewrite corpus production nếu user chưa duyệt nội dung.

**Gate P1:** Public route và SEO projection nhất quán, có evidence local và
production read-only.

## 4. P2 — Search

### Internal search

- [x] Kiểm tra filter mua bán/cho thuê, area, district, property type, price,
      pagination và empty state bằng focused tests + Chrome thật.
- [x] Kiểm tra kết quả chỉ trả Product đủ điều kiện public ở mọi public read path;
      user đã chạy `20260912020000_harden_public_property_eligibility.sql` và
      `manual_public_property_eligibility_verify.sql`. Production evidence ngày
      12/09/2026: policy contract và `public_property_eligibility_boundary_ok`
      đều `true`; `search_property_matches` tồn tại và là `SECURITY INVOKER`.
- [x] Mọi result card/detail link dùng cùng canonical builder; đã kiểm tra route
      area/district/property-type và pagination bằng Chrome thật.
- [ ] Đo đủ freshness sau create/update/unpublish/delete trên production; phần wiring
      queue/revalidation đã có test. Measurement ngày 12/09/2026 xác nhận cửa sổ 24 giờ
      có `news/publish` 7/7 succeeded, open/failed 0 và mọi integrity check bằng 0.
      Historical coverage 90 ngày xác nhận thêm `update` 124/124 succeeded và
      `unpublish` 14/14 succeeded; `create` và `delete` vẫn chưa có job production
      (24h coverage không phải lỗi nếu không có mutation tương ứng). Query:
      `supabase/manual_p2_freshness_lifecycle_measurement.sql` (đã có coverage 90 ngày
để phân biệt evidence trong cửa sổ đo và lịch sử propagation).
- [x] Sửa candidate preview để chỉ nhận marker test độc lập trong `slug`; không còn
      coi cụm từ biên tập chung như `kiểm tra` là fixture. Candidate preview vẫn là
      read-only và luôn yêu cầu owner xác nhận disposable trước mutation:
      `supabase/manual_p2_lifecycle_test_candidate_preview.sql`.
- [x] Owner đã chạy strict preview lúc `2026-09-12T12:04:57Z`: property/news
      marker matches đều `0`, candidate rỗng và `mutation_authorized = false`.
      Không có fixture production an toàn để thực hiện controlled `create/delete`.
- [x] Kiểm tra ranking không trộn paid/editorial signal vào organic ranking;
      ranking policy dùng tiêu chí intent/effective price và không có paid/editorial
      signal trong đường search đã kiểm.

### Search Visibility / Search Console

- [x] Candidate builder có đủ entity và reason code.
- [x] Registry không duplicate/stale/mismatch canonical — production SQL ngày
      12/09/2026: 192 rows, 175 eligible, canonical lỗi 0, duplicate 0, stale 0.
- [x] Freshness queue có status/evidence — production SQL ghi nhận 239 succeeded;
      latest eligibility sync xử lý 192/192, failed/deferred 0.
- [x] Sitemap submit đã được owner thực hiện ngày 12/09/2026 qua Chrome trên
      `https://chonhaviet.com/quantrihethong/seo-geo`; UI ghi nhận `succeeded · 1/1 URL`.
      Production read-only verification sau đó đạt: run mới nhất `sitemap_submit`
      succeeded `1/1/1/0`, đúng metadata/property, 175/175 eligible rows submitted,
      fingerprint group 1, timestamp/fingerprint đầy đủ, eligible error 0.
      Query: `supabase/manual_search_console_sitemap_verify.sql`.
      Đã thêm preview/verification read-only cho URL Inspection tại
      `supabase/manual_search_console_inspection_preview.sql` và
      `supabase/manual_search_console_inspection_verify.sql`.
- [x] URL Inspection tối đa 5 URL đã được owner thực hiện và xác minh ngày
      09/09/2026: run `inspection_batch` succeeded `5/5/5/0`, evidence 5/5,
      excluded inspected 0, canonical lỗi 0. Kết quả Google: 2 URL `PASS` và
      được gửi/lập chỉ mục; 3 URL `NEUTRAL`, đã phát hiện nhưng hiện chưa được
      lập chỉ mục. Đây là evidence từ indexed version, không phải live crawl test.
- [x] Không dùng Search Console success để khẳng định Google đã index.

**Gate P2:** Search nội bộ và Search Visibility có cùng canonical policy và
không có đường ghi nhận trùng — **đạt cho read-only production evidence ngày
12/09/2026**. Focused Search/Google tests 35/35, full Vitest 199 files /
1.548 tests, typecheck và production build đều đạt; Chrome route smoke production
cũng đạt. URL Inspection đã có evidence production; lifecycle historical coverage
đã xác nhận `publish`, `update` và `unpublish`, còn `create`/`delete` vẫn mở vì
production chưa có fixture disposable hợp lệ. Sitemap submit đã được đối chiếu
DB bằng query read-only và đạt; candidate preview đã được siết chỉ tìm marker
độc lập trong `slug` tại `supabase/manual_p2_lifecycle_test_candidate_preview.sql`.

## 5. P3 — AIO runtime, không dùng RAG

- [x] Xác định rõ AIO runtime dùng `aiSearch`, `aiAdvisor`, live database search
      và live public listing RPC.
- [x] Đã loại bỏ đường đọc `match_rag_chunks` khỏi public AIO; không rebuild hoặc
      backfill RAG.
- [x] Câu trả lời listing lấy source URL/canonical link và freshness từ live
      result; lớp Claude không tự sinh giá, ID, vị trí hoặc citation.
- [x] Không có dữ liệu phù hợp thì trả lời thiếu dữ liệu, không bịa.
- [x] Privacy boundary: public AIO không trả private listing, admin docs hoặc
      internal notes.
- [x] Đã kiểm tra result count, filter intent, price/location grounding và fallback
      bằng contract/unit tests hiện có.
- [x] Đã ghi rõ AIO runtime khác RAG projection và không gọi `refresh_rag_index`.

**Gate P3: ĐẠT.** P3 đã hoàn tất; không mở rộng hoặc quay lại AI/RAG trong bước
hiện tại. RAG vẫn deferred theo scope lock.

## 6. P4 — Analytics

- [ ] Xác nhận GA4 server client/config state/error mapping.
- [ ] Không gửi pageview cho `/noi-bo` và `/quantrihethong`.
- [ ] Không đưa credential/token xuống browser.
- [ ] Chốt event taxonomy: search, filter, listing view, contact, phone reveal,
      favorite, saved search, publish lifecycle nếu hợp lệ.
- [ ] Tách admin/staff/internal traffic khỏi public funnel.

**Progress 2026-09-13 — GA4 configuration boundary:** owner xác nhận GA4 đã
được cấu hình trong Vercel. Source phải ưu tiên `NEXT_PUBLIC_GA_ID`, không tự
đổi GA4 property; vẫn giữ validation GA4/Ads và consent/public-vs-private
boundary. GA4 Data API/report live và production redeploy vẫn còn mở.


**Next action:** deploy source đã verify để production đọc đúng
`NEXT_PUBLIC_GA_ID`; sau deploy dùng Chrome thật kiểm tra GA4 ID thực tế, rồi
chạy diagnostic/report GA4 Data API nếu ba server secrets đã được cấu hình:
`GOOGLE_ANALYTICS_CLIENT_EMAIL`, `GOOGLE_ANALYTICS_PRIVATE_KEY`,
`GOOGLE_ANALYTICS_PROPERTY_ID`. Không làm AIO/RAG trong bước này.
- [ ] Admin dashboard hiển thị `not_configured/configured/error` rõ ràng,
      không dùng số giả.
- [ ] Đối chiếu GA4 report với UI event names và date range.
- [ ] Chỉ lưu analytics evidence cần thiết; không tự lưu raw PII.

**Gate P4:** Có event contract và report đọc được số liệu thật hoặc hiển thị
chưa cấu hình một cách trung thực.

## 7. P5 — Cross-system acceptance

- [ ] Product lifecycle: draft → public → update → unpublish/delete.
- [ ] News lifecycle: draft → review → publish → update → unpublish.
- [ ] Taxonomy change ảnh hưởng đúng route/search/SEO.
- [ ] CMS change ảnh hưởng đúng public page/SEO.
- [ ] AIO runtime trả provenance sau public mutation.
- [ ] Analytics ghi nhận public behavior, không ghi internal/admin.
- [ ] Browser verification bằng Chrome thật.
- [ ] Full Vitest, typecheck, production build.
- [ ] `graphify update .` sau source change.
- [ ] Verify-gate receipt.

**Gate P5:** SEO/Search/AIO/Analytics hoàn tất độc lập với RAG.

## 8. Sau khi P5 đạt mới xem xét mở RAG

Điều kiện mở lại RAG:

- user duyệt riêng;
- knowledge public/private policy đã có evidence;
- source/chunk reconciliation đạt;
- quyền `refresh_rag_index` thống nhất;
- retry/outbox policy được chốt;
- rollback/backfill plan được duyệt.

## Tài liệu liên quan

- [System Function Catalog](file:///Users/macbucdatle/Desktop/project/docs/SYSTEM_FUNCTION_CATALOG.md)
- [System Operating Model](file:///Users/macbucdatle/Desktop/project/docs/SYSTEM_OPERATING_MODEL.md)
- [Current-State Audit](file:///Users/macbucdatle/Desktop/project/docs/SYSTEM_CURRENT_STATE_AUDIT_20260912.md)
- [Unified indexing rollout TODO](file:///Users/macbucdatle/Desktop/project/.claude/plans/unified-public-indexing-rollout-todo.md)
- [Search Console Phase 2](file:///Users/macbucdatle/Desktop/project/.claude/plans/google-search-console-phase2.md)
- [GA4 admin reporting](file:///Users/macbucdatle/Desktop/project/.claude/plans/ga4-admin-reporting.md)

## RAG boundary decision — 2026-09-12

**Approved:** RAG deferred khỏi P0–P5. Giữ `aiIndexing` làm adapter tương lai; public mutation chỉ chạy SEO, Search Visibility, freshness và AIO live. Không browser direct RPC, không rebuild/backfill. Chỉ mở lại bằng server configuration explicit sau một approval riêng.
