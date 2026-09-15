# TODO điều hành — Chợ Nhà Việt

> **Mục đích:** một bảng điều phối duy nhất để không nhảy việc, không trộn production evidence với code/local evidence và không mở lại hạng mục đã hoãn.
>
> **Nguồn ưu tiên:** production DB/runtime → code/tests → verify receipt → current-state docs → changelog → audit/plan cũ.
>
> **Cập nhật:** 2026-09-14
>
> **Trạng thái dùng:** `DONE` / `PARTIAL` / `TODO` / `DEFERRED` / `UNKNOWN` / `BLOCKED`.

## 1. Mục đích sản phẩm không đổi

Chợ Nhà Việt phát triển thành ba lớp liên kết:

1. **Marketplace BĐS đáng tin:** tin thật, tìm kiếm nhanh, liên hệ được người bán.
2. **Nền tảng dữ liệu BĐS địa phương:** taxonomy khu vực, dữ liệu giá, phương pháp đo minh bạch.
3. **Nền tảng tri thức BĐS địa phương:** nội dung có nguồn, entity graph, SEO/GEO/AIO và AI grounded trên dữ liệu thật.

Funnel trung tâm:

```text
Traffic → Local landing → Search → Detail → Trust
→ Contact/Lead → Staff/Seller follow-up → Return → Saved intent
```

Ưu tiên hiện tại là **chiều sâu dữ liệu Bình Dương và khu vực lân cận**, không mở rộng nationwide, monetization hay RAG mở rộng khi các gate nền chưa đóng.

## 2. Nguyên tắc bắt buộc cho mọi công việc

- Database production là nguồn sự thật; migration trong Git chưa được coi là đã chạy.
- Đo dữ liệu production trước khi chọn phương án dữ liệu hoặc schema.
- Mỗi lần chỉ làm TODO đứng đầu chuỗi dependency; không nhảy phase.
- Không bịa listing, giá, pháp lý, khoảng cách, trust score, market fact hoặc AI answer.
- SEO/GEO/AIO/schema là dữ liệu dẫn xuất từ source canonical; mutation phải revalidate/rebuild projection.
- AIO ưu tiên: Answer Block, FAQ/schema hợp lệ, cấu trúc dễ trích xuất, dữ liệu thật và server-rendered.
- Browser chỉ gọi public config; privileged operation đi qua server route/Edge Function và permission boundary.
- Staff không được vượt ownership/scope; owner-MFA bảo vệ thao tác privileged.
- SQL production do chủ sản phẩm tự chạy; sau đó mới read-only verify.
- UI chỉ kết luận bằng Chrome/Playwright thật; không dùng curl để kết luận nội dung render.
- Không tự commit/push. Nếu được phép push: **chỉ push production `origin/main`, tuyệt đối không push preview**, xin phép riêng cho từng lần.
- Sau source change: typecheck + Vitest + build + diff check + graphify update + verify-gate; không sửa source sau receipt.
- Không tạo queue/RPC/table/pipeline mới trước khi inventory chứng minh cần thiết.
- Không tự bật lại hạng mục `DEFERRED`.

Chu trình chuẩn:

```text
Rà soát → đo evidence thật → lập plan/TODO → chủ sản phẩm duyệt
→ implement → test/build/typecheck → browser verify
→ post-review → graphify update → verify receipt
→ xin phép commit → xin phép push origin/main
→ post-deploy SQL/browser verify
```

## 3. Trạng thái capability hiện tại

| Domain | Trạng thái | Mục đích | Gap chính |
|---|---|---|---|
| P1 Database foundation | `PARTIAL` | Nền schema/RLS/RPC/migration discipline | Canonical data contract, measurement/backfill/rollback đầy đủ |
| P2 Location/entity | `PARTIAL` | Area/district/ward/neighborhood và structured geography | Alias/canonical naming, roads/landmarks/developers/agents/company, structured content IDs |
| P3 Property lifecycle/data quality | `PARTIAL` | Listing thật, approval, expiry, ownership, reapproval | Canonical field source, duplicate/fraud signals, seller correction loop |
| P4 Search | `DONE` behavior | Buyer lọc/tìm/pagination ổn định | Chỉ tối ưu tiếp khi có measurement traffic/data |
| P5 Ranking | `DONE` behavior | Organic ranking explainable, không trộn paid | Cần evidence lớn hơn trước khi mở rộng |
| P6 Detail/conversion | `PARTIAL` | Detail, gallery, map, trust, contact, compare, favorite | Seller identity, trust evidence, conversion measurement, mobile/error regression |
| P7 Verification/trust | `PARTIAL` | Evidence xác minh fail-closed | Public explanation, reviewer scope, report incorrect, bỏ claim vượt evidence |
| P8 SEO/GEO/AIO | `PARTIAL` | Canonical, metadata, JSON-LD, sitemap, quality gate, entity discovery | Search Console/indexation evidence, structured entity content, corpus link/FAQ/citation cleanup, semantic/image cleanup |
| P9 AI Search | `PARTIAL` | Advisor grounded, matching deterministic, handoff người thật | Câu hỏi thật, link/freshness/count, privacy/logging/handoff evidence |
| P10 AI Listing | `PARTIAL` | Hỗ trợ tạo listing/content | Draft-first, human review, provenance, cấm AI tự publish claim |
| P11 AI Verification | `TODO` | AI chỉ đề xuất phát hiện, người duyệt quyết định | Phụ thuộc P7/P10 và policy |
| P12 CRM | `PARTIAL` | Lead, customer scope, assignment, activity/follow-up | SLA/routing, workload/response measurement |
| P13 Agent/company marketplace | `TODO` | Profile, portfolio, attribution, org permissions | Phụ thuộc P7/P12 |
| P14 Marketplace | `PARTIAL` | Inventory, submission, moderation, conversion | Seller Center, liquidity, duplicate/fraud, seller analytics |
| P15 Payment/entitlement | `TODO` | Paid product, order, payment, entitlement, refund | Chưa làm trước khi liquidity/conversion và business policy đủ evidence |
| P16 Performance/scale | `PARTIAL` | CWV, ảnh, query/cache/monitoring | Profile traffic thật, image pipeline/CDN, search scale |
| P17 Security/E2E | `PARTIAL` | RLS/role/MFA, boundary, browser checks | Buyer/seller/staff/admin bounded E2E, upload/IDOR/privacy/rate/error audit, ops monitoring |

## 4. Chuỗi công việc bắt buộc hiện tại

### A — Đóng Search Visibility/entity expansion đã hoàn tất (`DONE`, ưu tiên số 1)

**Mục đích:** tự động tạo registry URL cho intent tìm kiếm như “mua đất + khu vực”, “mua nhà + khu vực”, “thuê nhà + khu vực” để người dùng click được và AIO có URL canonical đọc được.

**Evidence đã có:**

- Production có 9 `property_types`.
- Active listings: Đất nền 33 (2 area, 4 district), Nhà phố 18 (2 area, 2 district).
- `news_categories`: 2 rows thật.
- Sync bị fail vì unique canonical constraint.
- Latest failed run: `eligibility_sync`, lỗi “Có hai nguồn đang tạo cùng một URL canonical”.
- Query bảng hiện tại cho thấy 16 row `canonical_url = null`; query property_type không có row. Đây là evidence registry hiện tại, chưa chứng minh candidate mới nào duplicate.
- Code hiện tại đã có property_type builder và `canonicalAuditUrl()`; cần đo candidate **từ dữ liệu production thật**, không suy luận từ bảng cũ.

**TODO theo thứ tự:**

- [x] Chạy một read-only diagnostic production trả về toàn bộ candidate canonical URL theo `entity_type`, `source_key`, `canonical_path`, `canonical_url`, kèm nhóm duplicate **chỉ với URL non-null**.
- [x] Phân biệt 4 loại lỗi: duplicate candidate mới, stale row trong registry, constraint/schema policy, hoặc lỗi classify message.
- [x] Không sửa dữ liệu production và không chạy full rebuild cho đến khi biết nhóm duplicate cụ thể.
- [x] Nếu là code defect: viết test regression đúng dữ liệu gây lỗi, sửa tối thiểu, test/build/graphify/verify.
- [x] Nếu là data/registry defect: viết dry-run và SQL remediation riêng; chủ sản phẩm tự chạy SQL.
- [x] Sau sync thành công, user chạy read-only verify: property_type rows, news_category `entity_id`, summary theo entity, latest run status.
- [x] Chỉ đánh dấu DONE sau khi production registry và latest run đều PASS.

**Không được làm:** bulk delete registry, đổi unique constraint, nới quality gate, hoặc gọi Google để “che” lỗi.

### B — Hoàn tất Gate 0 Public → SEO → AIO/RAG (`BLOCKED/PARTIAL`)

**Mục đích:** biết chính xác nguồn nào public, projection nào stale, boundary nào đang chồng chéo.

- [ ] Lưu đủ output `manual_public_aio_rag_boundary_verify.sql` hoặc bản summary tương đương.
- [ ] Xác nhận production `refresh_rag_index(text)`: tồn tại, version, ACL, guard.
- [ ] Đối chiếu source eligible với `rag_chunks` theo từng domain.
- [ ] Giải thích chênh lệch News published/valid/registry/chunk.
- [ ] Kiểm tra `property_types`, `news_categories`, `managed_pages` trong source/registry/chunk.
- [ ] Xác nhận `rag_index_runs` mới nhất và freshness sau 2026-09-03.
- [ ] Kiểm queue freshness: pending/failed/dead-letter/retry.
- [ ] Phân loại `ai_chat_knowledge` public/private; không tự mở rộng public vì production thiếu `knowledge_type`.
- [ ] Chốt một boundary refresh RAG; hiện direction là server orchestration, nhưng không tự drop browser path trước policy approved.

### C — News quality prevention (`PARTIAL`, không bulk rewrite)

**Mục đích:** bài mới lưu nháp được; owner publish mới bị kiểm tra một contract duy nhất; bài live cũ không tự hỏng.

- [x] Boundary draft/edit/publish/unpublish đã được map.
- [x] Production news publication boundary đã có evidence.
- [x] A2 filter/badge/blocker UI đã có code.
- [ ] Đối chiếu SQL proxy với TypeScript contract: keyword, FAQ, citation, internal link, title/excerpt/meta/GEO/image/author/slug.
- [ ] Tạo regression tests cho draft save, publish fail/pass, live update, auth/session/API error.
- [ ] Browser verify bằng owner-MFA nếu có phiên được phép.
- [ ] Không bulk rewrite 80 bài, không unpublish 75 bài, không đổi threshold.
- [ ] Không đấu nối tích hợp mở rộng trong batch này.

### D — SEO freshness observability (`PARTIAL/BLOCKED bởi session admin)

**Mục đích:** dashboard read-only cho queue freshness, không biến dashboard thành worker/mutation.

- [x] Helper, route, client wrapper, UI card, status/error DTO và test kỹ thuật đã có.
- [x] 24 succeeded, 0 pending/processing/failed/dead-letter trong baseline cũ.
- [ ] Chrome thật mở `/quantrihethong/seo-geo` bằng owner-MFA.
- [ ] Đối chiếu UI với SQL baseline production.
- [ ] Nếu còn gap: sửa → verify lại; không đánh dấu DONE chỉ vì unit tests pass.
- [ ] Cập nhật source-of-truth/changelog khi acceptance đủ.

### E — Permission/staff/AI Agent (`TODO/BLOCKED — sau Gate 0 và policy)

**Mục đích:** staff chỉ thấy và sửa đúng module/khu vực/field được cấp; AI Agent không vượt quyền.

- [ ] Chốt permission matrix user/staff/admin/owner-MFA.
- [ ] Chốt staff publish: review-only hay permission theo module.
- [ ] Chốt geographic scope và action granular.
- [ ] Đối chiếu assignment stale/non-staff sau evidence hiện có.
- [ ] Viết plan + dry-run trước mọi migration quyền.
- [ ] Browser E2E theo role sau khi có authorized accounts.

### F — Buyer/Seller/CRM E2E và trust (`PARTIAL`)

**Mục đích:** kiểm chứng funnel thật từ discovery đến lead, không chỉ kiểm tra code.

- [ ] Bounded E2E buyer: landing → search/filter → detail → gallery/map → contact.
- [ ] Bounded E2E seller: draft → preview → submit → approval/rejection → correction.
- [ ] Bounded E2E staff/admin theo scope, không tự tạo dữ liệu production nếu chưa được phép.
- [ ] Đo detail-to-contact, assignment/SLA và follow-up.
- [ ] Hoàn thiện public verification explanation và report incorrect listing.

### G — Performance/image (`PARTIAL`, chỉ sau measurement)

**Mục đích:** giảm chi phí tải và giữ CWV tốt bằng evidence thật.

- [x] P16/P17 baseline và một phần CWV đã verify production.
- [x] P18 xác định bottleneck là ảnh listing legacy lớn; detail không phải bottleneck chính.
- [ ] Chỉ chạy ImageOptimizerCard copy-on-write khi chủ sản phẩm cho phép thao tác ghi production.
- [ ] Đo trước/sau tổng transfer, LCP, CLS, mobile.
- [ ] Profile query/cache/image pipeline trước khi tối ưu rộng.

## 5. Hạng mục đã hoãn — không tự mở lại

- **RAG mở rộng / AI Search-RAG / Make.com:** `DEFERRED`; chỉ xem xét sau SEO → Search → AIO runtime → Analytics → cross-system verification.
- **P8 Growth Automation:** `DEFERRED`, làm sau cùng.
- **Content hubs pháp lý/vay/news category/district/ward:** `DEFERRED` cho đến khi có nội dung/dữ liệu thật.
- **Phase G mobile area hierarchy:** `DEFERRED`.
- **Monetization/payment:** `TODO` dài hạn, chờ liquidity/conversion/business approval.
- **Nationwide expansion:** không làm chỉ vì có route/schema mẫu.
- **Bulk News corpus rewrite:** không làm trong batch hiện tại.
- **Hai conflict location listing/property:** giữ nguyên cho đến khi chủ sản phẩm yêu cầu.

## 6. Quy tắc bắt đầu một phiên mới

1. Đọc file này và `docs/CHONHAVIET_SOURCE_OF_TRUTH.md`.
2. Kiểm tra production evidence liên quan; không tin plan cũ nếu mâu thuẫn.
3. Chỉ chọn **một mục checkbox đầu tiên chưa hoàn thành** trong chuỗi công việc.
4. Với codebase question: chạy `graphify query` trước khi đọc source.
5. Nếu cần thay đổi: trình bày scope, evidence, dependency, rollback; chờ chủ sản phẩm duyệt.
6. Sau khi làm: test → browser nếu UI → graphify update → verify receipt.
7. Trước commit/push: hỏi riêng; push production `origin/main`, không preview.
8. Cập nhật trạng thái trong file này sau khi có evidence mới.

## 7. Hiện trạng workspace cần giữ riêng

- Có các file debug/search-visibility chưa thuộc sản phẩm; không tự gom vào commit khác.
- Các commit debug trước đó đã tồn tại trên `origin/main` từ phiên trước; không tự rollback hoặc push thêm nếu chưa được chủ sản phẩm chỉ đạo.
- Production Search Visibility hiện vẫn `BLOCKED`; không báo DONE chỉ vì function wrapper trả chuỗi rỗng.
