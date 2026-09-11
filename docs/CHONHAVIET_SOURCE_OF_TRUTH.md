# Chợ Nhà Việt — Product Source of Truth

> Phiên bản hợp nhất: 2026-09-11
>
> Đây là nguồn sự thật duy nhất cho mục tiêu sản phẩm, hành trình người dùng, kiến trúc, trạng thái capability và roadmap dài hạn. Proposal hoặc plan cũ không được tự động coi là công việc đang chờ làm.

## 1. Thứ tự ưu tiên thông tin

Khi các tài liệu hoặc nhận định mâu thuẫn, dùng thứ tự sau:

1. Production database/runtime đã được xác nhận.
2. Code hiện tại, migrations và tests đã kiểm tra.
3. Production verification record.
4. Tài liệu current-state trong `docs/`.
5. `docs/CHANGELOG.md`.
6. Audit gốc.
7. Proposal và plan cũ.
8. Specification aspirational, sample hoặc toolkit độc lập.

Quyết định product mới do chủ sản phẩm phê duyệt có thể thay đổi roadmap, nhưng phải được ghi vào tài liệu này trước khi bắt đầu batch mới.

Migration trong Git chỉ thể hiện ý định. Không coi migration là đã chạy production nếu chưa có xác nhận và read-only verification.

## 2. Đích sản phẩm dài hạn

Chợ Nhà Việt phát triển thành ba lớp liên kết:

1. **Trustworthy real-estate marketplace** — inventory thật, listing chất lượng, seller có công cụ, buyer có thể tìm và liên hệ.
2. **Local property data platform** — taxonomy địa điểm, dữ liệu giá, lịch sử dữ liệu và phương pháp đo minh bạch.
3. **Local real-estate knowledge platform** — nội dung source-backed, entity graph, SEO/GEO/AIO và AI grounded trên dữ liệu thật.

Mục tiêu dài hạn:

- Người mua tìm đúng bất động sản nhanh.
- Người mua có đủ dữ liệu để so sánh và liên hệ.
- Người bán tự đăng được listing hoàn chỉnh.
- Listing có chất lượng, lifecycle và moderation rõ ràng.
- Người dùng quay lại nhờ favorite, saved search và dữ liệu phù hợp.
- Môi giới có công cụ quản lý listing, customer, lead và thương hiệu cá nhân.
- Dữ liệu có thể dùng làm nền cho search, SEO, AI và phân tích giá.
- Monetization không phá trust hoặc trải nghiệm tìm kiếm.
- Kiến trúc có thể mở rộng sau khi dữ liệu và vận hành đã ổn định.

Không phải mục tiêu:

- Clone code, media, branding hoặc content của website khác.
- Tạo synthetic listings, market figures, legal claims, distances hoặc trust scores.
- Mở rộng nationwide chỉ vì có schema hoặc route mẫu.
- Bật monetization trước khi seller supply và conversion có evidence.

Funnel trung tâm:

```text
Traffic → Local landing → Search → Listing detail → Trust
→ Contact/Phone/Callback → Lead → Staff/Seller follow-up
→ Sale signal → Return → Saved intent
```

## 3. Chiến lược thị trường

Ưu tiên hiện tại là chiều sâu dữ liệu tại Bình Dương và khu vực lân cận, không phải mở rộng toàn quốc ngay lập tức.

```text
Bình Dương
→ Thuận An
→ Bình Chuẩn
→ Khu dân cư
→ Dữ liệu giá
→ Tin đăng thật
→ Nội dung phân tích
→ Entity SEO
→ Google Search
→ AI Search / AIO / GEO
```

Specification nationwide marketplace là tầm nhìn dài hạn. Không triển khai theo tài liệu clone nếu chưa có dữ liệu, liquidity, seller supply và vận hành đủ tốt.

## 4. Personas và trách nhiệm

### Buyer/tenant/website visitor

- Tìm mua hoặc thuê.
- Lọc theo khu vực, giá, diện tích, pháp lý và loại bất động sản.
- Xem ảnh, bản đồ, chi tiết, FAQ, verification và seller.
- So sánh, favorite, recently viewed và saved search.
- Gọi, hiện số điện thoại, yêu cầu callback hoặc gửi form.

### User/member/seller

- Quản lý tài khoản.
- Đăng, sửa, gia hạn, tạm ẩn hoặc xóa listing của mình theo lifecycle.
- Xem trạng thái duyệt và lý do từ chối.
- Xem lead phát sinh từ listing thuộc tài khoản.
- Quản lý seller profile khi capability đã sẵn sàng.

### Agent

- Quản lý profile và portfolio listing.
- Xử lý customer/lead trong scope được cấp.
- Không vượt qua ownership hoặc RLS.

### Staff/advisor

- Xử lý customer được giao.
- Xem customer, listing và lead trong scope được kế thừa.
- Primary staff là người chịu trách nhiệm chính và SLA.
- Co-assignee có cùng scope xem nhưng không thay primary.
- Chỉ được cập nhật status, note và follow-up time của lead.
- Không được duyệt/reject listing, đổi ownership, xóa listing/media, link/unlink identity hoặc tự assign staff.

### Admin/operator

- Quản lý user, role, assignment, taxonomy, content, moderation, verification và policy.
- Duyệt, từ chối, ẩn hoặc xử lý listing theo quyền.
- Xem dữ liệu toàn hệ thống trong phạm vi policy.

### System/AI/integrations

- Kiểm tra và lưu dữ liệu.
- Áp dụng RLS, role và MFA boundary.
- Nhận lead qua public server boundary.
- Đồng bộ webhook, Edge Function và integration.
- Chỉ trả lời AI từ dữ liệu có bằng chứng.
- Trả về trạng thái không có dữ liệu khi evidence không đủ.

## 5. Hành trình và value streams

### 5.1 Supply stream

```text
Seller/agent tạo listing → Validate → Draft/Preview → Moderation
→ Active inventory → Renew/Update
```

### 5.2 Demand stream

```text
Visitor khám phá → Search/Filter/Map → Detail/Trust → Contact
→ Account → Favorite/Saved search → Quay lại
```

### 5.3 Operations stream

```text
Lead → Owner/customer scope → Assignment → Activity
→ Follow-up → Status → Measurement
```

### 5.4 Data/content stream

```text
Location/property/listing facts → Price data → Local content
→ Entity links → SEO/GEO/AIO → Grounded AI
```

### 5.5 Commercial stream

```text
Inventory/liquidity/conversion evidence → Paid products
→ Entitlement/Billing → Reporting
```

Không mở Commercial stream trước khi Supply, Demand, Operations và Data đạt gate tương ứng.

### 5.6 Buyer discovery

```text
Landing → Search/Listings → Filter → Deterministic pagination → Detail
```

Kết quả phải lấy từ inventory thật, chỉ listing active được public, pagination có tie-breaker ổn định và organic ranking không dùng paid/editorial flags.

### 5.7 Buyer trust và contact

```text
Detail → Gallery/Map/Legal/Verification
→ Phone reveal/Callback/Contact → Lead
```

Người mua phải biết ai nhận lead và verification đã kiểm tra điều gì. Không dùng claim tuyệt đối, social proof hoặc trust score nếu không có record/event tương ứng. PII không được đi vào URL.

### 5.8 Seller listing và moderation

```text
Register/Login → Đăng tin → Validate → Draft/Preview → Submit
→ Pending → Admin review → Approved/Rejected → Edit/Renew
```

Approval phải atomic, giữ property identity khi re-approve, bảo vệ ownership/lifecycle field và có lý do từ chối rõ ràng.

### 5.9 CRM

```text
Public interaction → public_submit_lead → leads → Assignment
→ Activity/Follow-up → Status
```

Scope owner dựa trên:

```text
leads.property_id
→ user_listings.property_id
→ user_listings.user_id
→ active user_customer_assignments
→ staff_user_id
```

Không dùng mù `leads.user_id` để xác định owner listing. Kết thúc assignment phải thu hồi inherited access ngay. Không tự động tạo duplicate `lead_assignments`.

### 5.10 Retention

```text
Favorite/Recently viewed/Saved search → Returning user → New discovery
```

Chỉ tuyên bố có alert/email/Zalo/push khi channel đã thực sự triển khai và xác minh.

### 5.11 Content, local data và entity discovery

```text
Area/Neighborhood/Price data/News → Internal links → Listing/Search
→ Organic discovery
```

Entity và location phải dùng dữ liệu có cấu trúc thật. Không fuzzy-link article với property bằng text khi chưa có structured IDs đáng tin.

News public chỉ đổi trạng thái qua owner-MFA boundary (`POST /api/admin/news/[id]/publish` → RPC `publish_news_article`). Create/update editorial luôn là nháp; không ghi `is_published` trực tiếp từ browser.

### 5.12 AI Advisor

```text
User requirement → Grounded matching/search → Listing links → Human handoff
```

AI phải có link listing, số lượng kết quả, ngày cập nhật và phân biệt giá rao với giá giao dịch. Không bịa pháp lý, khoảng cách, tiện ích, trust, dự báo hoặc market facts.

## 6. Kiến trúc hiện tại và đích

### 6.1 Application layers

```text
Public discovery UI
→ Authenticated account/seller UI
→ Staff/admin operations UI
→ Server routes/RPC/Edge Functions
→ Supabase Auth/RLS/Postgres/Storage
→ Analytics/search/content/integration services
```

Hiện tại ứng dụng dùng Next.js 14 App Router, React 18, TypeScript, Tailwind CSS và TanStack React Query.

### 6.2 Backend

Supabase cung cấp:

- PostgreSQL.
- Auth.
- Row-Level Security.
- Storage.
- RPC.
- Edge Functions.
- Cron/webhook integration.

Browser chỉ dùng public Supabase configuration. Privileged operation phải chạy ở server route hoặc Edge Function, xác minh caller trước khi sử dụng service role.

### 6.3 Domain boundaries đích

- Identity: `auth.users`, `profiles`, role và MFA.
- Property: tài sản vật lý và facts.
- Listing: phiên đăng tin, seller ownership, lifecycle và canonical URL.
- Location: area/district/ward/neighborhood và entity mở rộng.
- Media: ảnh/media, upload policy, processing và presentation.
- Trust: verification evidence, reviewer, timestamp, scope và report-invalid.
- Lead/CRM: source, property/listing relation, customer, assignment, activity và follow-up.
- Discovery: search, ranking, filters, map, recommendations và saved intent.
- Content/SEO: news, FAQ, citations, entity pages, metadata, schema và sitemap. News publication là owner-MFA RPC + quality gate, không phải direct table write.
- Commercial: plans, packages, orders, payments, entitlement và sponsored placement.
- Observability: privacy-safe events, audit, performance và operational metrics.

### 6.4 Data model

```text
auth.users ── profiles
areas ── districts ── wards ── neighborhoods
areas/property_types ── properties
profiles ── user_listings ── properties
properties ── leads ── lead_activities
leads ── lead_assignments ── profiles
chat_sessions ── chat_messages
chat_sessions ── chat_assignments ── profiles
```

`properties` và `user_listings` không được gộp tuỳ tiện:

- `properties` đại diện cho tài sản.
- `user_listings` đại diện cho listing do user sở hữu/quản lý.
- Public listing có lifecycle và canonical URL.
- Lead phải gắn với property/listing và ownership phù hợp.

Location hiện là mô hình hybrid để giữ backward compatibility:

- FK geography.
- Text geography.
- Coordinates.
- Polygon validation.
- Existing URL, filter, map và SEO dependencies.

Không thay thế wholesale location model khi chưa có measurement, migration dry-run, backfill plan và rollback plan.

### 6.5 Authorization

Nguồn sự thật của permission là:

- Supabase RLS.
- `auth.uid()`.
- Role checks.
- `SECURITY DEFINER` RPC với `search_path` cố định.
- Owner-MFA cho privileged admin route.
- Server-side validation tại boundary.

## 7. Nguyên tắc dữ liệu, trust, AI và security

1. Database production là nguồn sự thật của dữ liệu.
2. Title, card, detail, FAQ, metadata và JSON-LD phải lấy từ cùng nguồn chuẩn.
3. Không lấy diện tích từ title làm dữ liệu chính.
4. Giá rao phải phân biệt với giá giao dịch.
5. Location structured và text legacy phải được đồng bộ có chủ đích.
6. Chỉ hiển thị “đã xác minh” khi có verification record.
7. Public input phải đi qua validation và server boundary.
8. Không cho anon/authenticated insert trực tiếp vào bảng CRM nhạy cảm.
9. Client-side filtering không thay thế authorization server-side.
10. Staff chỉ có quyền mutation đúng field đã được duyệt.
11. Không log hoặc đưa PII vào URL, analytics và error message nếu không cần.
12. AI không được bịa dữ liệu hoặc claim.
13. Sample/template content không được đưa vào production truth.
14. Paid placement không được trộn với organic ranking.
15. Không tạo social proof giả hoặc viewer-count toast.

## 8. Quy ước trạng thái

- `DONE`: có bằng chứng code/test/browser hoặc production phù hợp.
- `PARTIAL`: đã có một phần nhưng còn gap load-bearing.
- `TODO`: cần thực hiện, chưa có implementation đủ.
- `DEFERRED`: user đã gác lại; không tự động triển khai.
- `UNKNOWN`: chưa đủ evidence để kết luận.
- `BLOCKED`: có dependency hoặc policy chưa đáp ứng.

Một migration hoặc proposal không đủ để chuyển hạng mục sang `DONE`.

## 9. Capability map: đã làm, chưa làm và còn thiếu

### P1 — Database foundation: `PARTIAL`

**Đã làm/có bằng chứng:** Supabase schema, RLS, RPC và migration discipline; production verification về location, lifecycle, ownership và lead boundary.

**Chưa làm đủ:** canonical data contract toàn hệ thống; measurement/backfill/rollback đầy đủ cho các thay đổi tiếp theo.

**Dependency:** nền cho mọi phase khác.

### P2 — Location/entity foundation: `PARTIAL`

**Đã làm/có bằng chứng:** area/district/ward/neighborhood taxonomy; district/ward integrity; polygon-backed coordinate validation; backward-compatible text geography.

**Chưa làm đủ:** alias/canonical naming policy; entity model cho roads, landmarks, industrial parks, developers, agents và companies; structured IDs cho content/listing relationships.

**Dependency:** P1; phải hoàn thành phần cần thiết trước SEO entity expansion.

### P3 — Property lifecycle/data quality: `PARTIAL`

**Đã làm/có bằng chứng:** atomic approval; lifecycle audit; expiry/ownership hardening; identity-preserving reapproval; một phần title/price/schema normalization.

**Chưa làm đủ:** canonical source cho mọi listing field; duplicate/fraud signals; seller lifecycle đầy đủ và rejection correction loop.

**Dependency:** P1/P2.

### P4 — Search engine: `DONE` ở hành vi đã verify

**Đã làm/có bằng chứng:** typed filters; active-only inventory; rental-aware price semantics; deterministic pagination và ID tie-breaker; search/relevance behavior.

**Việc sau này:** chỉ tối ưu khi có measurement thực tế; không mở rộng scope search ngoài dependency data.

**Dependency:** tiếp tục phụ thuộc data integrity.

### P5 — Ranking: `DONE` ở behavior đã verify

**Đã làm/có bằng chứng:** explainable organic ranking; không dùng paid/editorial flags làm organic signal.

**Việc sau này:** chỉ bổ sung ranking evidence khi behavior data đủ lớn; giữ separation organic/commercial.

### P6 — Property Detail/conversion: `PARTIAL`

**Đã làm/có bằng chứng:** gallery, map, POI, FAQ, share, favorite, compare, lead/contact/callback, loan calculator, comparable inventory và recommendation; một phần detail safety/truthful claims.

**Chưa làm đủ:** seller/advisor identity rõ; trust evidence đầy đủ; detail-to-contact measurement; loading/error/empty/mobile regression coverage.

**Dependency:** P3 và P7.

### P7 — Verification/trust: `PARTIAL`

**Đã làm/có bằng chứng:** verification logic fail-closed; badge scope và validity dates; hardening property/listing.

**Chưa làm đủ:** evidence model/reviewer scope; public explanation xác minh gì/khi nào/bởi ai; report incorrect listing; loại bỏ claim vượt evidence.

**Dependency:** P1/P3; gate trước monetization.

### P8 — SEO/GEO/AIO: `PARTIAL`

**Đã làm/có bằng chứng:** metadata, canonical, Open Graph, Twitter, schema, sitemap và robots; active-only sitemap; quality-gated area/neighborhood pages; source/citation/FAQ foundation. News publication boundary production: migration `20260909030000_news_publish_boundary.sql` (`content_version`, `news_publication_events`, RPC `publish_news_article`); Vercel `NEWS_PUBLISH_BOUNDARY_MODE=enforce`; create/update luôn nháp; publish/unpublish owner-MFA; cổng SEO–GEO–AIO (tối thiểu 3 cụm từ khóa AIO, không kẹp trần 3–6; ≥2 internal link `href="/..."`; FAQ/citation floor). Admin hiện toàn bộ lỗi chặn một lần. Evidence 2026-09-11: bài `doanh-nghiep-bat-dong-san-xoay-dong-tien-khi-suc-mua-suy-yeu` đăng lại thành công trên production sau enforce.

**Chưa làm đủ:** Search Console/indexation production evidence; structured entity content; internal-link coverage trên toàn corpus; image/semantic HTML cleanup dựa trên measurement.

**Dependency:** P1/P2/P7; không index thin/demo content.

### P9 — AI Search: `PARTIAL`

**Đã làm/có bằng chứng:** AI Advisor; deterministic matching/fallback; AI gateway/configuration foundation; policy không fabrication.

**Chưa làm đủ:** quality trên câu hỏi thật; listing links/freshness/result count luôn grounded; privacy/logging/human handoff evidence.

**Dependency:** P3/P4/P8.

### P10 — AI Listing: `PARTIAL`

**Đã làm/có bằng chứng:** một phần listing assistance và admin content workflows.

**Chưa làm đủ:** draft-first flow; human review; field-level provenance; chặn AI tự publish claim chưa kiểm chứng.

**Dependency:** P3/P7.

### P11 — AI Verification: `TODO`

Chưa có capability hoàn chỉnh. AI chỉ được hỗ trợ phát hiện/đề xuất; không thay human decision khi chưa có policy.

**Dependency:** P7 và P10.

### P12 — CRM: `PARTIAL`

**Đã làm/có bằng chứng:** leads từ phone reveal, callback, contact, AI Advisor, investment, about, valuation và property forms; public submit boundary; owner scope; customer assignment; primary/co-assignee; staff field-level mutation restriction; activity/follow-up/nurture foundation.

**Chưa làm đủ:** production measurement đủ lớn; SLA/routing policy; dashboard response/follow-up/workload.

**Automation:** `DEFERRED` theo quyết định user.

**Dependency:** measurement, sales policy và P3 ownership.

### P13 — Agent/Company marketplace: `TODO`

Cần agent/company profiles, portfolio, organization permissions, public profile trust evidence và lead attribution.

**Dependency:** P7, P12 và commercial policy separation.

### P14 — Marketplace: `PARTIAL`

**Đã làm/có bằng chứng:** public inventory, listing submission, moderation và conversion foundation.

**Chưa làm đủ:** Seller Center hoàn chỉnh; supply/liquidity growth; duplicate/fraud detection; seller analytics.

**Dependency:** P3/P6/P7/P12.

### P15 — Payment/entitlement: `TODO`

Cần commercial policy, product/package model, order/payment/invoice, entitlement enforcement, refund/failure state và separation giữa paid feature với organic truth.

**Dependency:** P14 liquidity/conversion và business approval.

### P16 — Performance/scale: `PARTIAL`

**Đã làm/có bằng chứng:** một số image/card optimization và performance measurement scripts.

**Chưa làm đủ:** Core Web Vitals evidence; image processing/CDN pipeline; query/index optimization theo profile thật; search scale, caching và monitoring.

**Dependency:** P3/P4 và actual traffic measurement.

### P17 — Security/E2E: `PARTIAL`

**Đã làm/có bằng chứng:** RLS/role/MFA hardening; public lead boundary; lifecycle/ownership protection; một số authenticated browser verification.

**Chưa làm đủ:** bounded E2E buyer/seller/staff/admin; upload, IDOR, privacy, rate boundary và error-contract audit; production operational monitoring.

**Dependency:** xuyên suốt mọi phase; không để đến cuối mới kiểm tra.

## 10. Roadmap tổng thể dài hạn

### Horizon 0 — Governance và evidence lock

**Mục tiêu:** một nguồn sự thật duy nhất, không lẫn roadmap.

**TODO:**

1. Duy trì file này làm product/architecture/roadmap authority.
2. Mỗi capability có status, evidence, gap và dependency.
3. Ghi rõ deferred register.
4. Không bắt đầu batch mới chỉ vì một plan cũ.

**Gate:** capability matrix được cập nhật và batch tiếp theo được chọn từ TODO đầu tiên chưa hoàn thành.

### Horizon 1 — Data và trust foundation

**Bao gồm:** P1, P2, P3 và phần load-bearing của P7/P17.

**TODO theo thứ tự:**

1. Đo và lập danh sách listing field không nhất quán.
2. Chọn canonical source cho title, diện tích, giá, pháp lý và location.
3. Thiết kế migration additive, dry-run, backfill và rollback.
4. Chuẩn hóa serializer/UI/schema từ cùng nguồn.
5. Xác nhận location alias và backward-compatible URL.
6. Định nghĩa verification evidence, scope và timestamp.
7. Đối chiếu verification record với UI public.
8. Hoàn thiện moderation state, rejection reason và report-invalid flow.
9. Kiểm tra lifecycle, ownership và reapproval invariant.
10. Verify bằng test, build, permission check và browser.

**Gate chuyển tiếp:** không còn conflict nghiêm trọng giữa title/card/detail/schema; không còn location contradiction đã biết; ownership/RLS test đạt; verification UI không vượt evidence.

### Horizon 2 — Functional marketplace loop

**Bao gồm:** P6, P14 và Seller Center tối thiểu.

**TODO theo thứ tự:**

1. Đo lại seller flow authenticated bằng browser thật.
2. Hoàn thiện draft, validation và preview.
3. Hoàn thiện upload/media error state.
4. Hoàn thiện pending, reject, edit, renew/hide.
5. Hiển thị seller/advisor identity và lead destination rõ.
6. Đồng bộ detail trust evidence với contact flow.
7. Hiển thị analytics seller cơ bản.
8. Kiểm tra owner boundary và moderation regression.
9. Verify loading/error/empty/mobile states.

**Gate chuyển tiếp:** seller hoàn thành listing không cần hỗ trợ thủ công; buyer đi được từ search đến lead; staff/owner/admin không vượt scope; mobile và error states được browser-test.

### Horizon 3 — Measurement, CRM và retention

**Bao gồm:** funnel measurement, P12, retention và phần observability của P17.

**TODO theo thứ tự:**

1. Chốt event taxonomy view → CTA → lead.
2. Loại bỏ PII không cần thiết khỏi telemetry.
3. Đo theo property, source và channel thật.
4. Tạo dashboard chỉ từ event có thật.
5. Read-only measure CRM production data.
6. Đối chiếu assignment, activity, follow-up và nurture với sales policy.
7. Chỉ hiển thị response time/due/overdue khi timestamp thật tồn tại.
8. Xác nhận favorite, recently viewed và saved search hiện tại.
9. Đo repeat behavior và saved-search behavior.
10. Chỉ triển khai alert khi channel và consent flow có thật.

**Gate chuyển tiếp:** có event data đủ tin cậy; có sales policy cho SLA/routing; không cần giả định từ sample nhỏ.

Automation vẫn `DEFERRED` cho đến khi user duyệt policy riêng.

### Horizon 4 — Local data, content và AI quality

**Bao gồm:** P8, P9, P10 và P11 sau khi P7 ổn định.

**TODO theo thứ tự:**

1. Chỉ dùng source-backed content và structured location IDs.
2. Giữ quality gate cho area/neighborhood pages.
3. Đồng bộ canonical, internal links, sitemap và JSON-LD.
4. Xác nhận Search Console production trước khi kết luận indexation.
5. Ground AI answer vào listing/content data thật.
6. Kiểm tra freshness, result count, link listing và fallback.
7. Bổ sung draft-first, human review và provenance cho AI Listing.
8. Chỉ thiết kế AI Verification sau khi human verification evidence ổn định.

**Gate chuyển tiếp:** không có fabricated claims; Search Console/indexation có evidence; AI output có listing/content provenance.

### Horizon 5 — Commercial marketplace

**Bao gồm:** P13, P15 và paid features của P14.

**TODO theo thứ tự:**

1. Đo inventory, liquidity và seller conversion.
2. Chốt agent/company và commercial policy.
3. Tách paid placement khỏi organic ranking.
4. Thiết kế product/package, order/payment/invoice.
5. Thiết kế entitlement, refund và failure state.
6. Verify payment/permission/entitlement trước public release.

**Gate chuyển tiếp:** inventory và liquidity có evidence; seller conversion có evidence; business policy, refund và entitlement đã được duyệt.

### Horizon 6 — Scale và resilience

**Bao gồm:** P16, P17 scale work và vận hành dài hạn.

**TODO theo thứ tự:**

1. Đo image/CDN và Core Web Vitals.
2. Đánh giá search index, warehouse và fraud detection.
3. Thiết kế monitoring, backup và disaster recovery.
4. Tối ưu database query/index theo profile thật.
5. Mở rộng enterprise permissions sau khi authorization model ổn định.
6. Chỉ mở partner API sau security review.

## 11. Dependency gates bắt buộc

Không được nhảy phase:

```text
Evidence lock
→ Data/taxonomy
→ Trust/lifecycle
→ Seller supply
→ Buyer conversion
→ Measurement
→ CRM/retention
→ Content/AI
→ Monetization
→ Scale
```

Luật cứng:

1. Không SEO entity expansion trước structured data và data depth.
2. Không AI Verification trước human verification evidence.
3. Không CRM automation trước measurement và sales policy.
4. Không payment trước seller supply, conversion và commercial approval.
5. Không nationwide expansion trước regional liquidity evidence.
6. Không đổi schema lớn trước dry-run, backfill, rollback và compatibility review.
7. Không kết luận production từ migration hoặc local test.
8. Không chọn batch tiếp theo nếu gate của batch trước chưa đạt.

## 12. Deferred register — làm sau

Các mục sau là `DEFERRED`, không phải TODO đang triển khai:

- Automated care/nurture và nurture-drip expansion.
- Tự động SLA, lead scoring, auto-stage, auto-assign và auto-message.
- CTA mobile batch đã bị loại khỏi scope hiện tại.
- Search Console/GA4 batch chỉ tiếp tục khi có approval và evidence mới.
- Các cookie-banner plan cũ.
- Nationwide clone expansion.
- Payment/monetization trước các horizon trước.
- AI fabrication hoặc synthetic market content.

Muốn mở lại một mục deferred phải có quyết định mới của user, scope, reason, dependency và acceptance criteria.

## 13. Cách phân tích một TODO nhỏ

Mỗi TODO nhỏ phải được tạo từ một capability và một horizon cụ thể, theo mẫu:

1. Capability/phase cha.
2. Vấn đề và evidence hiện tại.
3. Mục tiêu người dùng.
4. Personas bị ảnh hưởng.
5. Current flow và target flow.
6. Files/modules/tables/API liên quan.
7. Dependency gates đã đạt.
8. Phần không nằm trong scope.
9. Migration/dry-run/rollback.
10. Permission và security impact.
11. Unit/integration/browser/regression tests.
12. Acceptance criteria đo được.
13. Production SQL do user tự chạy nếu có.
14. Verify-gate, graphify update và push approval.

Không được chuyển sang TODO nhỏ tiếp theo nếu TODO trước chưa đạt Definition of Done.

## 14. Definition of Done cho mọi batch

Mỗi batch chỉ chuyển sang `DONE` khi có:

- Scope và acceptance criteria rõ.
- Data flow và permission impact được rà soát.
- Migration dry-run nếu có database change.
- Unit/integration/typecheck/build phù hợp.
- Browser verification cho UI.
- Regression check.
- `graphify update .` sau source change.
- Verify-gate receipt sau runtime verification.
- SQL production do user tự chạy.
- Push production chỉ sau approval riêng; push mặc định là `origin/main`, không phải preview.

## 15. Quy chế tài liệu

### Canonical

- File này là nguồn duy nhất cho product mission, architecture target, capability status, gaps và roadmap.

### Operational reference

- Root `CLAUDE.md`, `.claude/CLAUDE.md`, `supabase/bs.md` và integration contract cần thiết chỉ chứa quy trình vận hành, không tự tạo roadmap thứ hai.

### Historical evidence

- Changelog, security audit, migration verification và audit gốc có thể giữ để truy nguyên lịch sử, nhưng không được coi là trạng thái hiện tại nếu chưa đối chiếu.

### Sample/toolkit

- Sample AI/content và toolkit SEO độc lập không phải production source of truth.
- Service key chỉ được dùng ở server/tooling an toàn.
- Draft-only/human-review article boundary là production policy ưu tiên hơn flow publish trực tiếp cũ.

### Plan cũ

- Plan đã hoàn thành, bị supersede hoặc chưa được user chọn không được tự động tiếp tục.
- Nội dung còn giá trị phải được chuyển vào backlog/phase tương ứng trong file này trước khi archive hoặc xóa.
