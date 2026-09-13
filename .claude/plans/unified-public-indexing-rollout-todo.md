# Unified Public → SEO → AIO/RAG Rollout TODO

> Trạng thái: `APPROVED DIRECTION — NOT DONE`
>
> Ngày: 2026-09-11
>
> Người duyệt định hướng: chủ sản phẩm đã duyệt gói baseline hybrid/risk-based,
> queue/retry, system-generated SEO, public-canonical AIO và triển khai theo slice.
>
> Quy tắc: không tự chạy production SQL, không coi migration là deployed, không
> commit/push khi chưa có verify receipt và approval riêng.


## Scope override — 2026-09-12

User đã yêu cầu **tạm dừng toàn bộ triển khai/mở rộng RAG**. Ưu tiên hiện tại là:

```text
SEO → Search → AIO runtime → Analytics → cross-system verification
→ chỉ sau đó mới xem xét RAG
```

Todo chi tiết mới: [seo-search-aio-analytics-first.md](file:///Users/macbucdatle/Desktop/project/.claude/plans/seo-search-aio-analytics-first.md).

Các mục RAG trong tài liệu này giữ lại làm deferred register; không tự thực hiện.

**Evidence cập nhật ngày 12/09/2026:** Search + Search Visibility P2 core đã đạt
read-only production evidence. Sitemap owner submit đã được xác minh độc lập:
run `sitemap_submit` mới nhất `succeeded`, counters `1/1/1/0`, metadata đúng
property/sitemap, `175/175` eligible rows ở trạng thái `submitted`, fingerprint
group `1`, không có eligible error. URL Inspection tối đa 5 URL đã có evidence production ngày 09/09/2026: run
`inspection_batch` succeeded 5/5/5/0; 2 URL PASS/lập chỉ mục và 3 URL NEUTRAL/
đã phát hiện nhưng chưa lập chỉ mục. Lifecycle production có evidence historical
90 ngày cho `publish` 101/101, `update` 124/124 và `unpublish` 14/14 freshness
jobs succeeded; measurement 24 giờ mới nhất có `news/publish` 7/7 succeeded,
open/failed 0 và integrity checks 0. `create` và `delete` chưa xuất hiện trong
90 ngày, vẫn cần mutation disposable có kiểm soát để đóng evidence riêng.

## 0. Baseline và blocker phải đóng trước khi code tiếp

- [ ] Lưu đầy đủ output object đầu tiên của
      `manual_public_aio_rag_boundary_verify.sql`.
      Đã chuẩn bị bản one-row tương đương để tránh mất result set:
      `supabase/manual_public_aio_rag_boundary_summary.sql`; production SQL vẫn
      do user tự chạy.
- [ ] Xác nhận production function `refresh_rag_index(text)` tồn tại đúng
      phiên bản, quyền execute và guard.
- [ ] Quyết định/đồng bộ policy browser RPC: server-only hay owner-MFA qua
      server route; không để migration và Admin UI đi hai policy khác nhau.
- [ ] Đối chiếu số source rows eligible với số `rag_chunks` theo từng nguồn.
- [ ] Giải thích chênh lệch News published/valid/registry/RAG chunk.
- [ ] Kiểm tra vì sao `property_types`, `news_categories`, `managed_pages` không
      xuất hiện trong phân bố chunk user gửi: không có source rows hay chưa refresh.
- [ ] Kiểm tra `rag_index_runs` mới nhất và freshness sau `2026-09-03`.
- [ ] Phân loại hai `ai_chat_knowledge` public: public được phép hay cần private.
- [x] Xác nhận từ result set cuối: production thiếu `knowledge_type`; chưa đủ dữ liệu để kết luận public/private policy.
- [ ] Kiểm tra queue pending/failed/dead-letter và đường retry hiện có.
- [x] Ghi baseline `git status --short`, graph snapshot và danh sách file ngoài scope.
- [x] Hoàn tất local current-state inventory và ghi tại `docs/SYSTEM_CURRENT_STATE_AUDIT_20260912.md`.
- [ ] Chạy production Gate 0 inventory: `file:///Users/macbucdatle/Desktop/project/supabase/manual_unified_indexing_gate0_inventory.sql`.
- [x] Đã nhận one-row production summary ngày 2026-09-13 từ
      `file:///Users/macbucdatle/Desktop/project/supabase/manual_unified_indexing_gate0_summary.sql`;
      số liệu đã được ghi vào current-state audit.
- [x] Lập current-code permission boundary map trong
      `docs/SYSTEM_CURRENT_STATE_AUDIT_20260912.md`; policy staff và production
      assignment matrix vẫn để mở, không tự chốt từ code.
- [x] Đã nhận result set cuối của `manual_staff_permissions_verification.sql`,
      nhưng result chỉ là catalog coverage; đã tạo bản one-row summary
      `supabase/manual_staff_permissions_verification_summary.sql` để lấy đủ
      evidence trước khi chốt permission matrix production.
- [x] Đã nhận one-row summary lần đầu: RLS/policy/table privilege và trigger
      checks có evidence; phát hiện 3 assignment cùng trỏ tới profile role `user`
      (`7968e31d-39c4-437c-8ad9-6c62b0a4f6de`) trong module `news`.
- [x] `actual_permission_function_inventory` xác nhận đủ 10 function expected,
      đều `SECURITY DEFINER` với `search_path = public, pg_temp`; không tự sửa
      permission hoặc dữ liệu.
- [x] Owner đã duyệt phương án giữ role `user` và thu hồi đúng 3 assignment stale
      module `news`; đã chuẩn bị dry-run, guarded migration và verify SQL.
- [x] User đã chạy dry-run, migration và post-run verify; output production xác nhận
      `cleanup_ok = true`, target IDs còn `0`, target user assignments còn `0` và
      non-staff assignment rows còn `0`.

**Gate 0:** Local inventory và one-row production summary đã có. Gate vẫn mở cho
những phần chưa có evidence trong summary (policy/runtime boundary, permission
contract đầy đủ và đối chiếu route/canonical), không được tự suy ra hoặc mở phase mới.

## 1. Contract và quyền

- [ ] Ghi permission matrix cho user/staff/admin/owner-MFA.
- [ ] Chốt staff publish: review-only hay permission riêng theo module.
- [ ] Chốt trạng thái content: `draft`, `pending_review`, `published`,
      `unpublished`, `archived`.
- [ ] Chốt trạng thái propagation: `pending`, `processing`, `succeeded`,
      `degraded`, `retrying`, `failed`.
- [ ] Chốt hard blockers (safety/canonical) và soft failures (downstream).
- [ ] Chốt public AIO policy: public canonical + knowledge `public`.
- [ ] Chốt slug/canonical change và alias/redirect behavior.
- [ ] Cập nhật `docs/SYSTEM_OPERATING_MODEL.md` nếu có quyết định khác baseline.

**Gate 1:** Contract được user duyệt, không có permission mơ hồ.

## 2. Inventory, chống chồng chéo

- [ ] Map từng mutation hiện có vào source → route → revalidation → freshness →
      Search Visibility → RAG.
- [ ] Đánh dấu đường cũ, đường mới, đường trùng và đường chưa nối.
- [ ] Xác định có thể mở rộng `seo_freshness_jobs` hay cần outbox bổ sung.
- [ ] Không tạo queue/RPC/table mới trước khi có kết luận inventory.
- [ ] Kiểm tra mapping entity hiện có cho property type/news category/managed page.
- [ ] Ghi dependency map cho từng vertical slice.
- [ ] Cập nhật `docs/SYSTEM_FUNCTION_CATALOG.md` sau inventory.

**Gate 2:** Có một sơ đồ orchestration duy nhất và write-set rõ ràng.

## 3. Vertical slice Product

- [ ] Create draft từ user/staff không yêu cầu SEO kỹ thuật.
- [ ] Update public Product revalidate đúng detail/listing/area/neighborhood/
      sitemap paths.
- [ ] Publish/approval đi qua permission và canonical eligibility.
- [ ] Search Visibility registry không duplicate/stale.
- [ ] RAG Product có canonical path hợp lệ và property type grounding.
- [ ] Delete/unpublish retire route, registry, freshness và RAG.
- [ ] Slug change xử lý old path/alias theo contract.
- [ ] Unit/integration/browser/SQL verification.

**Gate Product:** một Product test đi hết lifecycle với evidence.

## 4. Vertical slice News

- [ ] Draft/edit không bị RAG/Google downstream chặn.
- [ ] Publish/unpublish dùng server publication boundary.
- [ ] Quality/citation gate đúng policy.
- [ ] Category/geo/source metadata nhất quán giữa route, registry, sitemap và RAG.
- [ ] Malformed slug không lọt public canonical/sitemap/RAG.
- [ ] Delete/unpublish dọn projection và revalidate old route.
- [ ] Kiểm tra News chunk count khớp valid eligible source rows.
- [ ] Unit/integration/browser/SQL verification.

**Gate News:** publish và unpublish đều có audit/evidence.

## 5. Vertical slice taxonomy và CMS

- [ ] Property type: xác định entity/dependency, update/delete impact Product.
- [ ] News category: CRUD/reorder impact category route, News, sitemap/RAG.
- [ ] Area/district/ward/neighborhood: impact route, Product, price stats, RAG.
- [ ] Managed page/page block: public eligibility, page content hash, revalidation.
- [ ] Chống orphan registry/chunk khi taxonomy bị xóa/đổi slug.
- [ ] Browser workflow cho staff không chuyên kỹ thuật.
- [ ] Unit/integration/browser/SQL verification.

**Gate Taxonomy/CMS:** mọi source public có coverage contract rõ.

## 6. AIO/RAG và retry

- [ ] Quyết định một đường gọi refresh: server orchestration.
- [ ] Dùng idempotency/source version/content hash.
- [ ] Không để `Promise.all` tạo trạng thái khó quan sát mà không có job evidence.
- [ ] Có per-source status và event tổng hợp.
- [ ] Có retry/backoff/dead-letter hoặc cơ chế tương đương hiện có.
- [ ] `admin_docs` luôn private.
- [ ] `ai_chat_knowledge` public/private có filter rõ.
- [ ] Kiểm tra canonical citation chỉ dùng eligible registry.
- [ ] Có freshness SLA/alert.

**Gate AIO:** nội bộ có thể chứng minh `succeeded` hoặc `degraded + retry`.

## 7. Production rollout

- [ ] Viết dry-run trước migration.
- [ ] User review dry-run output.
- [ ] User tự chạy migration production.
- [ ] User gửi full verify output.
- [ ] Đối chiếu trước/sau: source rows, registry, chunks, runs, permissions.
- [ ] Rebuild/backfill theo từng source, không full rebuild mù.
- [ ] Kiểm tra một create/update/delete/unpublish thực tế theo role.
- [ ] Ghi production verify receipt.

**Gate Production:** có evidence, rollback plan và user xác nhận.

## 8. Documentation/training

- [ ] Catalog chức năng: `docs/SYSTEM_FUNCTION_CATALOG.md`.
- [ ] Operating model: `docs/SYSTEM_OPERATING_MODEL.md`.
- [ ] Source of truth: `docs/CHONHAVIET_SOURCE_OF_TRUTH.md`.
- [ ] Runbook cho user/staff: form nào, trạng thái nào, lỗi nào.
- [ ] Runbook cho admin: review, publish, retry, audit.
- [ ] Runbook SQL: dry-run/verify links và cách đọc output.
- [ ] Bảng “chức năng → file → table → test → verify”.
- [ ] Changelog ghi batch, evidence, unresolved items.
- [ ] Mỗi module có owner/backup và dependency.

## Definition of Done

Một slice chỉ được đánh dấu `DONE` khi có:

- contract và permission rõ;
- không trùng pipeline;
- code/test phù hợp;
- typecheck/build đạt;
- browser verify nếu có UI;
- `graphify update .` sau source change;
- SQL production do user tự chạy nếu có;
- production verify evidence nếu tuyên bố deployed;
- tài liệu catalog/runbook cập nhật;
- verify-gate receipt;
- không còn blocker chưa được ghi rõ.

## News publication boundary follow-up — 2026-09-12

- [x] Xác định lỗi runtime `NOT_ALLOWED` do `trg_staff_news_permission` chặn service-role publication RPC.
- [x] Chuẩn bị migration boundary guard sau staff enforcement.
- [x] Chuẩn bị SQL verify read-only.
- [x] Thêm regression contract test.
- [x] User chạy `20260930090000_fix_news_publication_boundary_trigger.sql` trên production.
- [x] User chạy `manual_news_publication_boundary_trigger_verify.sql`; toàn bộ điều kiện đạt.
- [x] Browser verify publish News end-to-end.
- [x] Kiểm tra Search/SEO downstream sau khi publish.


## News slug correction and format hardening follow-up — 2026-09-13

- [x] Product code deployed to `origin/main` as `37e8838077bcf1fee6378b8d1503cdfd8e1316b8`.
- [x] Owner-MFA server boundary corrected the known malformed published News slug without changing publication state.
- [x] Search Visibility registry was resynced and the target row became `eligible = true` / `ELIGIBLE`.
- [x] All-News audit confirmed 80 valid rows and zero malformed or constraint-blocking published rows.
- [x] `public.news_slug_format` was validated successfully in production.
- [ ] Final Chrome old/new URL evidence remains a separate runtime check if not already recorded.


## RAG deferred boundary — 2026-09-12

- [x] Giữ server adapter `src/lib/server/aiIndexing.ts` làm đầu mối tương lai.
- [x] Mặc định không gọi `refresh_rag_index` từ public propagation.
- [x] Loại bỏ browser direct execution path trong `src/lib/api/aiRag.ts`.
- [ ] User áp dụng `20260930100000_defer_rag_browser_execution.sql` trên production.
- [ ] User chạy `manual_rag_deferred_boundary_verify.sql` và gửi output.
- [ ] Chỉ mở lại RAG sau approval riêng, không thuộc P0/P1 SEO hiện tại.

## P1 taxonomy/price route synchronization — 2026-09-12

- [x] Audit mutation paths cho property, user listing, News, taxonomy, CMS và price stats.
- [x] Purge toàn bộ public price surfaces sau `refresh_price_stats`.
- [x] Purge property URL cũ/mới khi Area slug thay đổi.
- [x] Purge area surfaces khi District thay đổi, kể cả lúc chưa có property liên kết.
- [x] Purge SEO group route cũ/mới khi Property Type slug thay đổi.
- [x] Thêm regression tests cho dynamic route allowlist, area slug và property-type slug.
- [x] Giữ RAG deferred trên mọi entity/page/category.


## Execution lock and plan status reconciliation — 2026-09-13

Đây là parent plan điều hành. Mọi công việc phải bám đúng các phase/gate trong
file này; không tự tạo phase mới từ một kết quả đo, không mở side quest và không
tự chuyển sang phase sau khi gate hiện tại chưa đóng. Khi toàn bộ DoD của kế hoạch
đạt, phải dừng và chờ yêu cầu mới.

### Đã hoàn thành hoặc đã có production evidence

- News publication boundary: đã có server boundary, permission guard, version
  check, event evidence và browser/production verification theo các mục đã ghi.
- News slug/canonical slice: slug malformed đã được sửa; 80/80 News hợp lệ;
  registry target `ELIGIBLE`; constraint format đã validate production.
- Search/internal search core: filter, pagination, canonical builder và public
  eligibility đã có focused tests, Chrome evidence và production read-only evidence.
- Horizon/A2 measurements: đã chạy xong read-only; kết quả được giữ làm evidence,
  không biến thành kế hoạch rewrite dữ liệu live.

### Còn mở trong đúng parent plan

- P0: hoàn tất các evidence baseline còn thiếu và chốt current-state map theo gate.
- P1: đóng các evidence public SEO còn thiếu cho route/canonical/sitemap/JSON-LD;
  không bulk-edit nội dung live.
- P2: freshness lifecycle còn thiếu evidence create/delete thực tế; chỉ đo khi
  có mutation/fixture hợp lệ, không tạo mutation chỉ để làm đẹp checklist.
- P3, P4, P5: chưa mở; chỉ xem xét sau khi gate trước đó đạt và có yêu cầu
  tiếp tục theo parent plan.

### Vị trí làm việc hiện tại

Việc tiếp theo chỉ được chọn từ các mục P0/P1/P2 còn mở ở trên. Không dùng các
TODO phát sinh bên ngoài parent plan làm căn cứ mở phase mới. Mỗi lần bắt đầu phải
chỉ rõ: `parent section`, `gate`, `write-set`, `dependency`, `verify` và
`stop condition`.
