# Audit kế hoạch SEO → Search → AIO → Analytics

> Ngày audit: **2026-09-12**  
> Trạng thái: **AUDIT HOÀN TẤT — CHƯA TRIỂN KHAI THAY ĐỔI MỚI**  
> Phạm vi: SEO public, Search nội bộ, Search Visibility/Search Console, AIO runtime không dùng RAG, Analytics.  
> RAG: **DEFERRED**, không rebuild/backfill/sửa logic trong batch này.

## 1. Kết luận ngắn

- Hệ thống đã có phần lớn nền tảng cần thiết; chưa cần tạo pipeline, queue hoặc source table mới.
- Rủi ro chính hiện tại là **nhiều đường orchestration**, entity coverage chưa đồng nhất và một số quyền/revalidation chưa được chứng minh theo role.
- Thứ tự an toàn nhất:

```text
P0 baseline/evidence
→ P1 SEO public consistency
→ P2 Search + Search Visibility
→ P3 AIO runtime live/public, không RAG
→ P4 Analytics
→ P5 cross-system acceptance + training
→ chỉ sau đó mới xem xét RAG
```

- Không thể tuyên bố “luôn hiển thị trên mọi công cụ tìm kiếm/AIO”. Hệ thống chỉ có thể bảo đảm public route, canonical, sitemap, registry, provenance và freshness; việc Google/AIO bên ngoài thu thập và xếp hạng vẫn cần evidence riêng.

## 2. Nguồn sự thật và nguyên tắc giữ nguyên

| Lớp | Nguồn hiện tại | Quyết định audit |
|---|---|---|
| Nội dung | Source tables trong Supabase | Giữ nguyên, không tạo bản sao |
| Public route | Next.js public routes | Giữ route, hợp nhất canonical policy |
| Canonical/eligibility | `search_visibility_urls` + `searchVisibility.ts` | Là registry SEO/Search trung tâm |
| Freshness | `seo_freshness_jobs` | Đo và mở rộng có kiểm soát; không tạo queue trùng |
| AIO runtime | `src/lib/aiSearch.ts`, `src/lib/aiAdvisor.ts` và live data path | Audit/chuẩn hóa provenance, không phụ thuộc RAG |
| Analytics | `src/lib/analytics.ts`, GA4 server/reporting | Giữ facade + server-only reporting |
| RAG projection | `rag_chunks`, `refresh_rag_index` | Deferred; không dùng làm acceptance của batch này |

## 3. Bản đồ chức năng hiện tại

### 3.1 Product

```text
src/lib/api/properties.ts
→ create/update/delete
→ src/lib/api/contentRevalidation.ts
→ app/api/admin/revalidate-content/route.ts
→ propagatePublicIndexing()
→ Search Visibility / freshness / AIO-related downstream
```

Điểm cần xác minh ở P0/P1: mutation của `user`/`staff` có ghi source thành công nhưng bị `requireOwner()` chặn ở bước propagation hay không.

### 3.2 News

```text
src/lib/api/news.ts
→ draft/edit

app/api/admin/news/[id]/publish/route.ts
→ publish_news_article_server(...)
→ propagatePublicIndexing()
```

Boundary publication server đã được user chạy và verify: RPC tồn tại, `SECURITY DEFINER`, `search_path = public, pg_temp`, chỉ `service_role` execute; browser roles không execute.

### 3.3 Taxonomy/CMS

- `src/lib/api/taxonomy.ts`: area, district, ward, neighborhood, property type, news category.
- `src/lib/api/cms.ts`: managed page, page block, featured section, layout.
- `src/lib/server/contentRevalidation.ts` hiện có entity rõ cho `news | property | area | neighborhood | route`; chưa có contract rõ cho `property_type | news_category | managed_page | page_block`.
- Vì vậy taxonomy/CMS có nguy cơ đang piggyback vào `property`, `news` hoặc `route`; không được mở rộng tự do trước khi có dependency map.

### 3.4 SEO public

Các điểm chính:

- `src/lib/seo.ts`
- `src/lib/slug.ts`
- `src/lib/productPath.ts`
- `src/lib/areaPath.ts`
- `src/lib/areaSeo.ts`
- `src/lib/routeSeo.ts`
- `app/sitemap.ts`
- `app/sitemap-images.xml/route.ts`
- `app/robots.ts`
- public route files

Nền tảng đã có canonical builders và sitemap/robots; việc còn thiếu là đối chiếu end-to-end, malformed/stale URL evidence và quy tắc thống nhất cho mọi entity.

### 3.5 Search Visibility/Search Console

- `src/lib/server/searchVisibility.ts`: candidate builder, eligibility, reason codes, stale cleanup.
- `src/lib/server/searchVisibilityService.ts`: persistence/actions.
- `src/lib/api/searchVisibility.ts` và `app/api/admin/search-visibility/route.ts`: admin operations, sitemap submit, bounded inspection, access diagnosis.

Đây là lớp nên làm registry canonical cho SEO/Search; không tạo một registry thứ hai.

### 3.6 AIO runtime không dùng RAG

- `src/lib/aiSearch.ts`: parse intent và tìm kiếm theo dữ liệu live.
- `src/lib/aiAdvisor.ts`: matching/advisor trên Product data.
- `src/components/AiSearchChat.tsx`: UI chat.
- `src/lib/api/properties.ts`, `src/lib/api/aiChat.ts`: data/lead handoff.

Đã có filter intent theo tiếng Việt, location, property type, price, area, bedroom, legal/loan; có fallback không bịa khi thiếu dữ liệu. Cần chứng minh public/privacy boundary, canonical citation, freshness và behavior bằng fixture/production-safe data.

### 3.7 Analytics

- `src/lib/analytics.ts`: event facade, constants, sanitization.
- `src/lib/server/googleAnalytics.ts`: server-side GA4 report.
- `src/lib/api/googleAnalytics.ts`, `app/api/admin/google-analytics/route.ts`: admin-only reporting.
- `src/components/admin/tabs/GoogleAnalyticsTab.tsx`: UI trạng thái/report.

Nền tảng đã tồn tại đáng kể; cần audit contract/evidence, không làm lại GA4 từ đầu.

## 4. Đã có / đang trùng / còn thiếu

### Đã có

- Canonical path builders cho Product và các public route chính.
- Search Visibility candidate/eligibility/reason code/stale cleanup.
- Freshness job table hiện có.
- News publication server boundary đã verify production.
- AIO live search/advisor không bắt buộc RAG.
- Analytics facade và server-side GA4 reporting.
- Dry-run/read-only SQL và tài liệu catalog/operating model.

### Đang trùng hoặc cần hợp nhất

1. **RAG boundary**: server `refreshAiIndex` và browser `adminRefreshRagIndex`; giữ trong deferred register, không sửa batch này.
2. **Plan files**: unified contract, Horizon 4, Freshness Phase 3, GSC Phase 2/hardening, GA4 reporting có phần giao nhau; dùng plan SEO-first này làm parent, các plan cũ phải được gắn `parent/child`, `superseded` hoặc `deferred`.
3. **Propagation**: `propagatePublicIndexing()` chạy nhiều downstream trong request; cần một evidence/status model, nhưng không tạo queue mới trước khi đo queue hiện có.
4. **Entity revalidation**: taxonomy/CMS chưa có entity contract riêng.

### Còn thiếu hoặc chưa được chứng minh

- Production Gate 0 one-row/full output cho SEO/Search/AIO/Analytics.
- Role matrix user/staff/admin/owner-MFA cho mutation và propagation.
- Một canonical contract chung cho Product, News, Area, Neighborhood, Category, Managed Page.
- Freshness/retry/evidence thực tế sau create/update/unpublish/delete.
- AIO provenance: source URL, canonical path, timestamp/freshness, privacy filtering.
- Phân tách lỗi kỹ thuật SEO với lỗi nội dung cần staff biên tập.
- Cross-system lifecycle test có evidence.
- Runbook thao tác cho user/staff không cần nhập JSON-LD, canonical hoặc RAG chunk.

## 5. Đối chiếu với các kế hoạch hiện có

| Kế hoạch | Xử lý đề xuất |
|---|---|
| `seo-search-aio-analytics-first.md` | **Parent plan được duyệt**, giữ làm thứ tự chính |
| `unified-public-indexing-rollout-todo.md` | Giữ làm master/deferred register; cập nhật scope RAG deferred |
| `unified-public-indexing-contract.md` | **Child/reference**; chỉ lấy phần SEO/Search contract sau khi đối chiếu code |
| `horizon4-seo-content-consistency-todo.md` | **Child của P1**; measurement giữ, không tự rewrite nội dung |
| `phase3-freshness-observability-todo.md` | **Child của P2/P5**; không tạo pipeline mới trước inventory |
| `google-search-console-phase2.md` | **Child của P2**; thao tác GSC owner-only |
| `google-search-console-phase2-hardening.md` | **Hardening của GSC Phase 2**, không phải plan độc lập |
| `ga4-admin-reporting.md` | **Child của P4**; audit code/evidence trước, không làm lại |
| `ga4-deep-behavior-analytics.md` | Chỉ mở sau P4 event contract |
| `search-visibility-*` hotfix plans | Chỉ áp dụng nếu P0/P1 evidence tái hiện đúng lỗi; không chạy hàng loạt |

## 6. Quyết định triển khai được đề xuất

### Slice A — P0/P1: SEO public consistency

**Write-set dự kiến:** chỉ SEO helpers/routes/tests/docs nếu audit tìm thấy lỗi; không đụng RAG.  
**Kết quả cần có:** canonical/sitemap/robots/internal links thống nhất; malformed/stale evidence; public route không bị downstream chặn.  
**Rollback:** revert từng thay đổi code; production SQL chỉ do user chạy.

### Slice B — P2: Search + Search Visibility

**Write-set dự kiến:** search query/result canonical, registry/service, freshness wiring, tests/docs.  
**Kết quả cần có:** public-eligible result, canonical link thống nhất, stale/duplicate registry evidence, lifecycle freshness.  
**Rollback:** revert slice; không tạo registry/queue mới.

### Slice C — P3: AIO runtime không RAG

**Write-set dự kiến:** `aiSearch`/`aiAdvisor`/response provenance/privacy/tests/UI nếu cần.  
**Kết quả cần có:** grounded live/public response, canonical source URL, freshness, no-private/no-hallucination fallback.  
**Không làm:** `refresh_rag_index`, `rag_chunks`, `knowledge_type`, RAG rebuild.

### Slice D — P4: Analytics

**Write-set dự kiến:** event taxonomy/sanitization/report/UI/tests.  
**Kết quả cần có:** public funnel đo được; internal/admin không làm nhiễu; not-configured/error trung thực.

### Slice E — P5: nghiệm thu xuyên hệ thống + training

**Kết quả cần có:** lifecycle evidence, browser verification, docs/runbook, catalog map chức năng → file → table → test → verify.

## 7. Gate bắt buộc trước mỗi slice

1. User duyệt slice và write-set cụ thể.
2. Kiểm tra/đo đúng scope; không tự mở rộng.
3. Nếu production SQL: tạo dry-run trước, user tự chạy, gửi output.
4. Sửa code nhỏ, disjoint; không tạo chức năng trùng.
5. Chạy typecheck/Vitest/build; UI phải verify bằng Chrome thật.
6. `graphify update .` sau source change.
7. Ghi verify-gate receipt.
8. Commit/push là bước riêng, chỉ làm khi user duyệt riêng.

## 8. Slice A — kết quả triển khai

Đã triển khai một thay đổi P1 nhỏ, không tạo pipeline mới và không đụng RAG:

- Thêm `src/lib/newsPath.ts` làm canonical builder cho News public path.
- Public News route chỉ cho phép slug hợp lệ; slug malformed/missing trả 404 với `noindex`.
- Request bằng UUID hợp lệ được redirect về `/tin-tuc/{slug}`.
- Metadata/JSON-LD News không còn fallback URL bài viết về UUID.
- Public internal links từ News và Neighborhood không còn trỏ tới UUID/malformed slug.
- Thêm `src/lib/newsPath.test.ts`.

### Evidence Slice A

- Focused SEO tests: **54 tests passed**.
- Full Vitest: **196 files / 1,523 tests passed**.
- Typecheck: **passed**.
- Production build: **passed**; có cảnh báo fetch Supabase DNS trong môi trường local, không làm build fail.
- Chrome/Playwright thật: `/` và `/tin-tuc` trả HTTP 200, H1 và canonical đúng.
- `graphify update .`: đã chạy.
- Verify-gate receipt: đã ghi.

### Giới hạn chưa kiểm được

- Chưa mở được bài News cụ thể có dữ liệu production hợp lệ trong môi trường local.
- Chưa kiểm tra admin/authenticated flow.
- Console local có 404 cho Vercel Insights/Speed Insights; không liên quan thay đổi canonical News.

## 9. Trạng thái hiện tại

```text
Audit report: DONE
Slice A SEO public consistency: DONE (local + browser evidence)
Production SQL: NOT RUN BY AGENT
RAG: DEFERRED
Next approval required: Slice B — Search + Search Visibility
```


## News publication closure and P0/P1 continuation — 2026-09-12

### News incident closure

- Publication boundary trigger hotfix đã được user áp dụng và verify đầy đủ.
- Chrome publish end-to-end đã đạt: admin `Đã đăng`, public detail `200`, canonical đúng,
  `robots: index, follow`, sitemap có URL News mục tiêu.
- Không còn lỗi chặn publication trong bài kiểm tra này.
- Chưa thực hiện unpublish/delete lifecycle để tránh side effect dữ liệu.

### Residual non-blocking observations

- `touch_my_presence` trả `403 User profile not found` ở heartbeat; không ảnh hưởng News/SEO.
- Vercel Analytics/Speed Insights trả `404` khi chạy local `next start`; chưa kết luận production.
- Publication response hiện `mode: observe`; bài có `content_version` đã đi qua server RPC,
  nhưng các bản ghi cũ thiếu version cần được đo trước khi chuyển enforce.

### Next approved execution point

- Tiếp tục theo thứ tự **P0 baseline → P1 SEO public consistency**.
- P0 cần production one-row summary do user chạy; không tự chạy SQL production.
- RAG vẫn deferred; Gate 0 chỉ thu thập evidence read-only, không rebuild/backfill.

## RAG boundary decision — 2026-09-12

- **Đã duyệt:** tách RAG khỏi luồng SEO → Search → AIO runtime → Analytics.
- `src/lib/server/aiIndexing.ts` vẫn là adapter/đầu mối để đấu nối lại sau này, nhưng mặc định `deferred`; chỉ mode server explicit `AIO_RAG_MODE=enabled` mới cho phép gọi RPC.
- Public indexing vẫn thực hiện `revalidatePath`, freshness queue và Search Visibility; không rebuild/backfill RAG trong rollout này.
- Browser/Admin không còn gọi trực tiếp `refresh_rag_index`; nút đồng bộ hiển thị trạng thái tạm hoãn.
- Migration production và SQL verify được tách riêng; production SQL do user tự chạy.

## Slice B Search + Search Visibility — local/browser evidence — 2026-09-12

Đã tiếp tục Slice B trong phạm vi không gây side effect production:

- `aiSearch`/listing query contract đã được kiểm tra bằng focused tests:
  **106 tests passed** cho search intent, listing URL/parser, public filter
  operations, Search Visibility, public indexing và freshness wiring.
- Chrome thật trên production server local đã kiểm tra:
  - `/mua-ban`: 52 tin bán, hiển thị 16 tin/trang;
  - chọn `Bình Dương` chuyển về `/mua-ban/binh-duong`, còn 24 tin và district
    options được thu hẹp đúng còn 9 huyện/thành phố;
  - chọn `Thủ Dầu Một` chuyển về `/mua-ban/binh-duong/thu-dau-mot` và trả 0 tin
    theo dữ liệu hiện có, không hiển thị tin ngoài khu vực;
  - chọn `Đất nền` dùng URL thân thiện
    `/mua-ban/binh-duong/thu-dau-mot?loai=dat-nen`;
  - `/mua-ban?page=2` giữ tổng số 52 và hiển thị 16 tin;
  - `/cho-thue` hiển thị 4 tin;
  - query không có kết quả hiển thị empty state trung thực cho cả bán và cho thuê.
- `/quantrihethong/seo-geo` hiện hiển thị Search Visibility **192 URL / 175 đủ
  điều kiện / 17 loại trừ**, Google evidence 169 URL; Freshness Queue sạch với
  0 pending/processing/failed/dead-letter.
- Đã vá một điểm lệch P2 trong sort giá của trang danh sách hỗn hợp: khi không
  khóa `mua_ban` hoặc `cho_thue`, sort giá hiện đi qua `search_property_matches`
  để dùng giá hiệu lực (`price` cho bán, `price_per_month` cho thuê), thay vì
  sort mọi dòng theo cột `price`.
- Thêm SQL read-only
  `supabase/manual_search_visibility_p2_verify.sql` để user đối chiếu production
  registry shape, canonical, duplicate/stale evidence (including rows behind the
  latest successful eligibility sync), runs, freshness và quyền
  của `search_property_matches` RPC. Query không sync, không submit sitemap,
  không inspect Google và không mutate dữ liệu.

### Production P2 verification — 2026-09-12

User đã chạy `supabase/manual_search_visibility_p2_verify.sql` trên production.
Kết quả one-row lúc `2026-09-12T07:33:52.497509+00:00`:

- Registry: **192 URL**, trong đó **175 đủ điều kiện**, **17 loại trừ**.
- Canonical: eligible thiếu canonical **0**; canonical path lỗi **0**; canonical URL
  lỗi **0**.
- Tính nhất quán: source key trùng **0 nhóm**; canonical URL trùng **0 nhóm**;
  registry phía sau lần sync eligibility thành công gần nhất **0 dòng**.
- Latest eligibility sync: `192/192` processed/succeeded, `failed=0`,
  `deferred=0`, hoàn tất lúc `2026-09-12T04:07:49.606+00:00`.
- Freshness: `239 succeeded`; không xuất hiện pending/processing/failed/dead-letter
  trong output.
- `search_property_matches` tồn tại và có quyền execute cho `anon` và
  `authenticated`.
- Hai cờ nghiệm thu kỹ thuật đều đạt: **`p2_registry_shape_ok=true`**,
  **`p2_search_contract_ok=true`**.

### P2 còn mở ở phạm vi owner/lifecycle

- Search Visibility registry production đã đạt shape/canonical/duplicate/stale gate.
- Search Console server-side chưa cấu hình; sitemap submit/URL inspection vẫn là
  thao tác owner riêng và không được suy ra là Google đã index.
- Chưa thực hiện lifecycle mutation unpublish/delete trên production để đo
  freshness/registry retirement vì có side effect dữ liệu.

**Kết luận:** phần Search nội bộ + Search Visibility read-only của P2 đạt. Có thể
chuyển sang audit **P3 — AIO runtime không dùng RAG**; các action Search Console và
lifecycle production giữ lại làm owner-gated follow-up.

## P3 kickoff finding — 2026-09-12

Audit tĩnh sau khi đóng evidence P2 phát hiện một điểm chưa phù hợp với scope
`AIO runtime không dùng RAG`:

- `supabase/functions/ai-chat/index.ts` hiện vẫn gọi
  `db.rpc("match_rag_chunks", ...)` để dựng `DỮ LIỆU TRUY XUẤT` trước khi gọi
  Claude; citations cũng được đối chiếu từ các chunk RAG.
- Đây là **đường đọc runtime**, không phải lỗi quyền `refresh_rag_index`; boundary
  deferred/service-role vẫn đúng. Tuy nhiên, chỉ khóa quyền refresh chưa đủ để
  tuyên bố AIO đã độc lập với RAG.
- Phần card listing của `AiSearchChat` vẫn lấy từ live search
  (`getAdvisorMatches`/`search_property_matches`), nhưng phần hiểu câu hỏi và
  trả lời có citation vẫn còn phụ thuộc RAG.

Vì vậy **P3 chưa đạt và chưa được đánh dấu hoàn tất**. Bước kỹ thuật tiếp theo là
thiết kế/đấu nối evidence live/public cho `ai-chat` (hoặc fallback rule-based an
toàn), sau đó bổ sung contract test để bảo đảm public AIO không gọi
`match_rag_chunks` và không trả private/admin source. Không rebuild/backfill RAG
trong bước này.

## P2 follow-up finding — public Product eligibility boundary — 2026-09-12

Trong audit code sau khi nhận production output, phát hiện public policy của
`properties` trước đây chỉ kiểm tra `is_active = true`. Điều đó chưa đồng nhất
với Search Visibility canonical Product gate: một row active nhưng thiếu
`public_code`, slug hợp lệ, `listing_type` hỗ trợ hoặc `areas.slug` hợp lệ vẫn có
thể đi qua direct PostgREST read; `search_property_matches` là `SECURITY INVOKER`
nên cũng phụ thuộc policy này.

Đã chuẩn bị và user đã chạy migration:
`supabase/migrations/20260912020000_harden_public_property_eligibility.sql`.
Migration chỉ thay public SELECT policy cho `anon`/`authenticated`, giữ nguyên
policy admin/staff và không ghi/sửa dữ liệu. User đã chạy SQL read-only:
`supabase/manual_public_property_eligibility_verify.sql`.

Production evidence ngày **12/09/2026**:

- `policy_exists = true`;
- `public_property_policy_contract_ok = true`;
- `search_property_matches_exists = true`;
- `search_property_matches_security_invoker = true`;
- `public_property_eligibility_boundary_ok = true`.

Vì vậy public Product eligibility boundary đã **đạt production read-only
verification**, đồng nhất với canonical Product gate của Search Visibility. P2
vẫn chỉ mở các owner-gated follow-up có side effect: lifecycle
unpublish/delete và Search Console submit/inspection; không suy ra Google đã
index chỉ từ trạng thái API.

Phần server-only Search Console client, owner-MFA actions (`diagnose_access`,
`submit_sitemap`, `inspect_batch`) và admin UI đã được triển khai/test ở local.
Production Search Console vẫn chưa chạy: workspace không có bốn biến secret phía
server và chưa có evidence quyền property của service account. Vì vậy chưa gửi
sitemap, chưa inspect URL và chưa kết luận URL đã được Google index.

Để chuẩn bị đo lifecycle mà không tự tạo mutation production, đã bổ sung SQL
read-only một-row:
`supabase/manual_p2_freshness_lifecycle_measurement.sql`. File này đo theo cửa
sổ thời gian các freshness job theo `event_kind/event_action`, trạng thái retry/
dead-letter/lock, các Search Visibility run và registry state. Cần chạy sau một
mutation kiểm soát do owner chỉ định; hiện chưa có production lifecycle evidence
cho create/update/unpublish/delete.



## P2 verification refresh — 2026-09-12

- Focused Search/Search Visibility tests: **52/52 passed**.
- Full Vitest: **198 test files / 1,543 tests passed**.
- Typecheck: **passed**.
- Production build: **passed**; static generation vẫn ghi nhận DNS Supabase local
  `ENOTFOUND`, nhưng build hoàn tất.
- Chrome thật trên production build local (cổng 3456) đã mở và đo:
  `/mua-ban`, `/cho-thue`, `/danh-sach`, `/khu-vuc`, `/khu-dan-cu`, `/tin-tuc`.
  Tất cả có H1/canonical đúng, không có App Error và không có HTTP 5xx.
- Console local còn 404 cho Vercel Insights/Speed Insights và CORS `ai-reco` do
  origin local không phải `https://chonhaviet.com`; đây là giới hạn môi trường
  local, không phải lỗi chunk/render của các Search route.
- `graphify update .`: đã chạy; graph được cập nhật.
- Vá một gap thực tế ở Search Console UI: trạng thái nay tách rõ
  `chưa cấu hình` / `cấu hình nhưng chưa xác thực quyền` / `sẵn sàng`; nút submit
  sitemap và inspect chỉ mở sau khi owner diagnostic xác nhận exact URL-prefix
  property. Thêm 3 unit tests cho state machine; không đưa secret/token xuống
  browser.

## P1 route-surface synchronization patch — 2026-09-12

- Đã vá purge cache sau `refresh_price_stats` cho hub giá, area listing và khu dân cư public.
- Đã vá area slug đổi để purge cả URL sản phẩm theo area slug cũ/mới.
- Đã vá district changes để purge area listing surfaces ngay cả khi chưa có property liên kết.
- Đã vá property-type slug changes để purge SEO group route cũ/mới.
- Route allowlist hiện chấp nhận có kiểm soát các path động public `/khu-vuc`, `/khu-dan-cu`, `/mua-ban`, `/cho-thue`.
- RAG vẫn deferred; không có thay đổi production SQL mới.
