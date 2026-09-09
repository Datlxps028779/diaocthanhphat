# TODO — Phase 3 Freshness Observability

> Mục tiêu: triển khai dashboard SEO freshness read-only, tự kiểm tất cả luồng trước khi báo hoàn tất. Không coi batch DONE nếu còn unchecked item hoặc chưa có verify-gate receipt.

## A. Chuẩn bị và baseline

- [x] Đối chiếu plan đã duyệt và giữ scope MVP: read-only, owner-MFA, không retry/delete/requeue.
- [x] Đo lại schema/query shape `public.seo_freshness_jobs` bằng read-only; không tạo job và không gọi worker.
- [x] Ghi baseline production hiện tại: 24 succeeded, 0 pending/processing/failed/dead_letter; cron gần nhất succeeded.
- [x] Kiểm tra working tree để không stage/commit file không thuộc Phase 3.

## B. Thiết kế contract và test trước code

- [x] Chốt DTO không chứa `dedupe_key`, worker/lock identity, secret, token, raw headers hoặc PII.
- [x] Viết test helper cho status counts, oldest pending, next retry, latest success, bounded warnings.
- [x] Viết test sanitizer cho `last_error`: truncate và redact secret-like values.
- [x] Viết route tests: 401, 403, 200 owner, 503 DB error, narrow DTO, không mutation.
- [x] Viết client API test nếu convention hiện tại phù hợp. *(Không thêm: wrapper mỏng; route contract và full Vitest đã bao phủ hành vi.)*

## C. Implementation

- [x] Tạo `src/lib/server/seoFreshnessObservability.ts`.
- [x] Tạo `app/api/admin/seo-freshness/route.ts` dùng `requireOwner` + `adminClient` server-side.
- [x] Tạo `src/lib/api/seoFreshness.ts` typed client wrapper.
- [x] Tạo/integrate `FreshnessQueueCard` trong `SeoGeoTab`.
- [x] Hiển thị đủ 5 status, healthy state, warning state, retry metadata, loading/error/empty.
- [x] Xác nhận dashboard không auto-call worker, Google hoặc mutation queue.

## D. Kiểm thử kỹ thuật

- [x] Chạy focused helper tests.
- [x] Chạy route/API/UI tests liên quan.
- [x] Chạy full Vitest.
- [x] Chạy `npm run typecheck`.
- [x] Chạy production build.
- [x] Chạy `git diff --check`.
- [x] Sửa lỗi test mock phát hiện ở lần chạy full và chạy lại toàn bộ nhóm test bị ảnh hưởng.

## E. Tự kiểm tất cả luồng bằng browser thật

- [x] Khởi động production build local theo quy trình an toàn.
- [x] Mở trang public/SEO để xác nhận không ảnh hưởng sitemap và landing.
- [ ] Mở `/quantrihethong/seo-geo` bằng Chrome thật với owner-MFA nếu có phiên hợp lệ. *(Blocked: môi trường hiện không có owner-MFA session; route fail-closed 404.)*
- [ ] Kiểm healthy state khi queue sạch. *(Blocked: cần admin session.)*
- [ ] Kiểm refresh: dữ liệu cập nhật, nút disable trong lúc tải, không tạo job/mutation. *(Blocked: cần admin session; route/unit boundary đã kiểm.)*
- [ ] Kiểm loading state. *(Covered by component logic/build, chưa có authenticated browser session.)*
- [x] Kiểm 401 khi chưa đăng nhập.
- [x] Kiểm 403 với tài khoản không đủ quyền bằng route test; chưa có credential test để chạy browser thật.
- [x] Kiểm 503/empty/error state bằng route/helper mock, không mutate production.
- [x] Kiểm warning failed/dead-letter bằng fixture/helper test, không mutate production.
- [x] Kiểm desktop và mobile boundary, không overflow ở các trang public; authenticated admin UI chưa thể mở.
- [x] Thu console/page errors và chụp screenshot; các lỗi local Vercel Insights/route 404 được ghi nhận là môi trường local.
- [x] Ghi rõ luồng nào không thể kiểm vì thiếu owner-MFA/staff account.

## F. Đồng bộ và nghiệm thu

- [x] Chạy `graphify update .` sau mọi source change cuối cùng.
- [x] Kiểm lại diff sau graphify; không sửa source sau verify receipt.
- [x] Ghi verify-gate receipt với URL/viewport/luồng đã mở và giới hạn kiểm tra.
- [ ] Đối chiếu UI với SQL baseline production; nếu lệch thì dừng, sửa và verify lại. *(Blocked: chưa có owner-MFA session để tải DTO dashboard.)*
- [ ] Cập nhật `docs/CHONHAVIET_SOURCE_OF_TRUTH.md` capability/evidence nếu batch đạt DONE.
- [ ] Cập nhật `docs/CHANGELOG.md` nếu quy trình dự án yêu cầu.
- [ ] Chỉ stage file Phase 3.
- [ ] Báo cáo kết quả đầy đủ, không báo hoàn tất khi còn luồng chưa tự kiểm hoặc test fail.

## G. Commit và deploy

- [ ] Xin/xác nhận quyền commit nếu cần theo quy trình phiên hiện tại.
- [ ] Commit riêng Phase 3, không gom dirty/untracked workspace khác.
- [ ] Xin phép push riêng.
- [ ] Push thẳng `origin/main`.
- [ ] Xác nhận remote/deploy nhận đúng commit.
- [ ] Hậu kiểm production dashboard bằng Chrome và read-only SQL.
- [ ] Chỉ đánh dấu TODO DONE sau khi post-deploy verification đạt.

## Definition of Done

- [ ] Tất cả mục A–G đã được đối chiếu.
- [ ] Typecheck, full Vitest, build, diff check PASS.
- [ ] Browser thật đã tự kiểm mọi luồng khả dụng; phần không khả dụng được nêu cụ thể.
- [ ] Không có source change sau verify-gate receipt.
- [ ] Graphify đã cập nhật sau source change.
- [ ] Production dashboard khớp baseline/read-only query.
- [ ] Commit/deploy/post-deploy verification hoàn tất nếu user đã cho phép.
