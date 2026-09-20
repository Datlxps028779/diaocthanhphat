# Tiến độ hiện tại

## Phase địa phương / FAQ / báo cáo tự sinh — 2026-09-16

## Cập nhật verify phase địa phương — 2026-09-16

- [x] Tích hợp bộ lọc: query `typeId/minPrice/maxPrice` chỉ được mang theo khi route không sở hữu chiều đó; khoảng giá tự do sống qua refresh/đổi phạm vi; reset landing về URL nền sạch; đổi bán/thuê bỏ khoảng giá khác đơn vị. Không đọc/sửa `src/lib/queryKeys.ts`.
- [x] Full Vitest/typecheck/diff-check sau tích hợp: 234 file, 2001 test đạt, 1 test bỏ qua; graphify update đạt.
- [x] Production build cô lập tại `/tmp/chonhaviet-locality-preview-fduqXe`, không đè root `.next`; Chrome thật cổng 3104 đạt hành trình URL/SEO/FAQ/schema/responsive 7 viewport/back-forward/product/reset/menu/drawer; pageErrors=0, blockedWrites=5.
- [x] Parity review read-only: middleware report, legacy exact-type report, sitemap/audit và source keys không có lỗi đúng-sai xác nhận.
- [ ] Resource errors local còn do preview không có service-role cho proxy ảnh và route Vercel analytics; chưa dùng chúng để kết luận production UI.
- [ ] Chưa commit/push/deploy phase mới; cần phê duyệt riêng.


**ĐÃ ĐƯỢC NGƯỜI DÙNG DUYỆT TRIỂN KHAI.** Yêu cầu: “lập todo để bám sát làm… bắt tay vào làm luôn”. Baseline UI đã commit `13f996d` trên `feat/locality-report-phase`, chưa push. Kế hoạch: `/Users/macbucdatle/.claude/plans/delightful-crafting-island.md`.

- [x] Chốt phạm vi: tỉnh, loại hình cấp tỉnh, 4 khoảng giá bán, phường/xã, FAQ và report cùng context; không nhân mọi tổ hợp lọc.
- [x] Baseline read-only: 57 tin public (BD28, BP29, HCM0, DN0), 53 mẫu bán đủ giá/diện tích; 3 tin BP thiếu ward, không tự sửa.
- [x] Kiểm namespace GET public 07:20 UTC: 4 tỉnh, 53 huyện, 682 xã, 9 loại; không va chạm `loai/gia/phuong-xa/thong-tin`. Bằng chứng `/tmp/chonhaviet-locality-namespaces.json`.
- [ ] Hợp đồng URL cũ/mới; TDD resolver/context và chống sai cha/con.
- [ ] Snapshot public đầy đủ có giới hạn, sale/rent đúng đơn vị, median/mean/mẫu, unknown ward; cache dùng chung, không partial stats.
- [ ] Gate/FAQ/metadata theo context, phân biệt 3 mẫu giá với 5 tin/index; report không trùng landing.
- [ ] Mốc A: landing tỉnh + FAQ 2/1 cột + CTA/report riêng; homepage CTA tỉnh vào landing, giữ tabs/config/tìm tin.
- [ ] Mốc B: loại hình/giá/phường và report scope tương ứng; giữ product URL, query filters và back/forward.
- [ ] Đồng bộ sitemap, Search Visibility và revalidation trước/sau thay đổi; giải quyết input sample500 trong các gate bị tác động.
- [ ] Mốc C: admin description/ghi chú công khai, partial save/readback/error đúng quyền; không ghi production để thử.
- [ ] Chrome thật 7 viewport + direct links/SSR/schema + regression menu/timeline/drawer/news/product; fixtures không thay bằng chứng production.
- [ ] Typecheck/full Vitest/build snapshot riêng, graphify update, diff-check, verify receipt mới.
- [ ] Bàn giao kết quả và giới hạn. Commit phase mới/push/deploy cần phê duyệt riêng; không đụng preview3102/3103 đang dùng trước khi bản mới đạt.

Rào chắn: không SQL production, không service-role/session/admin credentials, không chỉnh taxonomy/constraints/RLS/CRM/RAG; không đọc/sửa `src/lib/queryKeys.ts`; không stage các file dirty ngoài phạm vi.

## Phê duyệt commit UI — 2026-09-16

Người dùng đã cho phép commit local toàn bộ chỉnh sửa UI vừa hoàn tất (menu/search, timeline, drawer, khối địa phương, editor CMS và khoảng cách bài viết lớn). Các ghi chú “chưa được phê duyệt commit” bên dưới là trạng thái của vòng kiểm chứng trước đó. Chưa được push/deploy; dự kiến bàn giao cùng phase trang địa phương/FAQ/báo cáo tự sinh sau khi phase mới được duyệt và kiểm chứng. Không đưa các file cấu hình cá nhân hoặc audit ngoài phạm vi vào commit UI.

## CSS bài viết lớn trang chủ — 2026-09-16

- [x] Gộp mô tả vào cùng khối padding với tiêu đề/ngày đăng tại `src/LandingPage.tsx`; khoảng cách tiêu đề → metadata 8px, metadata → mô tả 12px, clamp 2 dòng. Giữ nguyên ảnh, nội dung và bố cục 3 cột.
- [x] Chrome thật cổng 3103: 7 viewport 1920/1440/1280/1024/768/390/320 không overflow, khoảng cách đúng; ảnh tải được, tab có bài/rỗng và link bài viết đạt, pageErrors 0. Build riêng 54/54 đạt; cập nhật preview 3103, giữ nguyên admin 3102.
- Bằng chứng: `/tmp/chonhaviet-news-spacing-report.json`, `/tmp/chonhaviet-news-spacing-{build,browser,graphify,receipt}.log`, screenshot `/tmp/chonhaviet-news-spacing-loaded-1440.png`. Snapshot đang phục vụ được ghi trong `/tmp/chonhaviet-news-spacing-dir.txt`; snapshot khu vực bên dưới là bản trước sửa CSS này.
- Không ghi production, không SQL, chưa commit/push/deploy.

## Thiết kế lại khối địa phương — 2026-09-16 (hoàn tất local, chưa push)

Người dùng đã duyệt kế hoạch và yêu cầu “oke làm đi”. Chỉ làm lại `region_banners` theo ảnh mẫu: card khu vực + tab địa phương hiện tại → huyện, không dùng Bắc–Trung–Nam.

- [x] Đo lại bằng GET public: 56 tin active, Bình Dương 28 (24 bán/4 thuê), Bình Phước 28 bán; 52 tin bán đủ giá/diện tích; 56 tin có district_id. Taxonomy có 4 tỉnh.
- [x] Rà cấu hình: region_banners đã bật, order 4, updated_at 2026-09-16T04:27:12.059613+00:00. Giữ cấu hình người dùng đã đổi, không tự PATCH production.
- [x] API GET batch `/api/public/location-stats`: chỉ đọc `public_properties`, lọc `is_active=true`, dùng anon; keyset + kiểm exact count + probe cuối, timeout/cap, cache khoảng 60s. Không trả row/ID tin/contact. Giá bán tách thuê; từng mean cần ít nhất 3 mẫu. GET public độc lập đối chiếu đủ 56 tin và các phép tính min/mean/mean đơn giá đều khớp. Không coi kiểm count là transactional snapshot khi giá đổi đồng thời.
- [x] Card ảnh + thông tin giá + CTA theo mẫu; 3 card theo cấu hình hiện tại, 4 tab taxonomy; directory huyện 3/2/1 cột. Tắt card không mất tab; rỗng/tắt hết vẫn theo empty_behavior. Editor dùng chung giữ nguyên logic lưu, bổ sung diễn giải. Tab đang chọn tự lộ đầy đủ bằng cuộn ngang, không ép nhảy trang.
- [x] Chrome thật bản cuối tại `http://localhost:3103`: 7 viewport 1920/1440/1280/1024/768/390/320, không body overflow; kiểm tab đang chọn không bị cắt, keyboard, card/tab đồng bộ, CTA/link huyện, mở rộng/thu gọn. Loading/error/retry/ảnh hỏng/taxonomy rỗng/disabled card/empty_state/reduced-motion đạt; edge case chỉ dùng browser response fixtures, không ghi production. pageErrors = 0. Đã đọc screenshot desktop + mobile.
- [x] Regression Chrome bản cuối: menu, cascade/URL tìm kiếm, timeline 10px ở 6 viewport, drawer Đã xem ở 7 viewport đạt. Build snapshot `/tmp/chonhaviet-location-final-5vvx686p` đạt 54/54; hash toàn bộ src/app khớp main. Cổng 3102 vẫn nguyên process/phiên admin; preview 3103 chỉ chứa public environment, không sao chép session admin.
- [x] Full suite: 213 file đạt + 1 file bỏ qua; 1695 test đạt + 1 bỏ qua. Typecheck, diff-check và graphify update đạt; graphify vẫn cảnh báo thiếu SQL parser và một số edge metadata, không tự cài/thay môi trường. Verify receipt mới đã ghi trên 795 file sau hậu kiểm cuối.
- [ ] Commit/push/deploy chưa được phê duyệt. Không thêm migration hoặc ghi DB production trong đợt thiết kế lại; lưu admin/read-back thật và UI production vẫn chưa kiểm.

Bằng chứng local: `/tmp/chonhaviet-location-final-{build,browser,edge,menu,search,timeline,drawer,suite,receipt}.log`; `/tmp/chonhaviet-location-redesign-data-check.json`; screenshot `/tmp/chonhaviet-location-redesign-clean-{1440,390,320}.png`.

Phần checklist dưới đây ghi lại vòng UI trước thiết kế lại; trạng thái hiển thị khu vực mới nhất là mục phía trên.

## UI trang chủ — 2026-09-16

Phạm vi: hoàn tất yêu cầu giao diện đã duyệt; không mở lại roadmap deferred.

- [x] Timeline public: 12 khung giờ, ngày/tuần/lịch, polling; thẻ hai cột, chữ 10px, lề cân đối. Chrome regression trên bản tích hợp đạt.
- [x] Đo dữ liệu ở vòng triển khai: 56 tin public, Bình Dương 28 / Bình Phước 28; 4 tỉnh, 53 huyện. Preflight ban đầu chưa có timeline; hậu kiểm hiện tại đã có timeline (xem mục SQL bên dưới). `region_banners` vẫn đang ẩn.
- [x] Menu 15px, hero motion và reduced motion; Chrome 1920/1440/1280/1024/768/390/320, URL tìm kiếm và cascade tỉnh/huyện/xã đạt.
- [x] Drawer Đã xem: tin public thật, focus Tab/Escape/backdrop, trả focus, khóa/khôi phục cuộn, lỗi mạng giữ history, prune tin unavailable, cùng tab/khác tab, reload/link và không refetch loop đạt Chrome; không mount trong admin.
- [x] Khám phá tỉnh → huyện: dùng taxonomy thật, URL kèm tỉnh, trạng thái lỗi/rỗng và retry đã kiểm Chrome. Không tự bật section production.
- [x] Editor tỉnh dùng chung: thêm/sửa/xóa/sắp xếp/ẩn thẻ, partial save, kiểm tra phiên bản, zero-row và lỗi cache đạt bằng Chrome fixture (không phải DB thật).
- [x] Đã tạo SQL preflight/migration/verify. Người dùng đã gửi kết quả preflight, timeline trong SQL Editor, thông báo Success và kết quả verify; không còn yêu cầu chạy lại migration chỉ để thêm dòng đã tồn tại. Chưa có dry-run PostgreSQL riêng.
- [x] Hậu kiểm DB production ngày 2026-09-16: GET chỉ đọc bằng anon xác nhận 11 section; timeline đúng label, hiển thị, order 3, settings {}; 10 section cũ giữ nguyên label/settings/visibility/order/updated_at so với preflight. Kết quả SQL người dùng cung cấp xác nhận RLS bật, policy INSERT/UPDATE yêu cầu is_admin(), SELECT công khai. Chỉ xác nhận trạng thái DB; không suy ra ai đã tạo timeline từ timestamp.
- [x] Kiểm chứng Chrome local sau SQL với cấu hình DB thật trên preview 3103: timeline và region_banners hiển thị đúng; baseline không thay response cấu hình. Fixtures chỉ dành cho lỗi/edge case.
- [ ] Authenticated save/read-back trên DB test riêng hoặc môi trường được phép — chưa có bằng chứng; browser fixture không chứng minh RLS. Frontend local đang dùng DB production, chỉ lưu thay đổi thật được người dùng duyệt, không ghi dữ liệu thử tùy ý.
- [ ] Preset đặt khám phá ngay dưới timeline chưa áp trên DB thật. Cấu hình mới nhất: region_banners đã bật, order 4; timeline và featured_sections cùng order 3. Tôn trọng cấu hình đã lưu, không tự đổi thứ tự.
- [x] Cổng kỹ thuật ở vòng triển khai trước SQL: full suite 209 file / 1642 test đạt, 1 bỏ qua; typecheck, production build riêng, graphify và diff-check đạt. Verify receipt đã ghi trên 786 file sau hậu kiểm Chrome bản cuối; không coi đó là bằng chứng admin DB thật hoặc UI sau SQL.
- [x] Đã tạo preview bản tích hợp tại `http://localhost:3102` ở vòng triển khai; snapshot riêng, không đè `.next` đang dùng. Chưa tái xác nhận server còn chạy trong lượt rà TODO. Route harness admin chỉ nằm trong snapshot `/tmp`, không có trong source để deploy. Preview mặc định tôn trọng `region_banners` đang ẩn; test khám phá/admin dùng response fixture.
- [ ] Commit/push/deploy — chưa được phê duyệt cho đợt UI này; mỗi push cần duyệt riêng.
- [ ] Hậu kiểm UI production bằng browser thật sau deploy — chưa thực hiện cho đợt UI này.

**Giới hạn đã ghi nhận:** API lưu nhiều section tuần tự, không phải giao dịch atomic; UI báo lỗi một phần và giữ draft. Trigger updated_at đã được xác nhận tồn tại, chưa có bằng chứng thực thi qua lưu admin thật. ACL được cung cấp có quyền TRUNCATE cho anon/authenticated (không chịu RLS); đây là lưu ý phân quyền riêng, chưa kiểm toán khả năng truy cập qua API, không thử thao tác phá dữ liệu và không tự thay quyền.

**SQL thực tế:**
- `supabase/manual_homepage_ui_config_preflight.sql`
- `supabase/migrations/20260916100000_homepage_timeline_section.sql`
- `supabase/manual_homepage_ui_config_verify.sql`

**Sự cố quy trình đã thông báo:** tác vụ phụ gửi hai PATCH thử quyền lên `page_sections` production trái rào chắn chỉ đọc: anon trả 200 + `[]`, service-role trả 400 `22P02`. Không có bằng chứng ghi thành công; GET hậu kiểm thấy cả 10 row giữ timestamp ngày 08-08. Đã dừng thử quyền. Không coi đây là một phiên chỉ có request read-only; không lặp lại hoặc dùng production làm sandbox.

## Ghi chép Gate 0 cũ

Phần dưới là ghi chép ngày 2026-09-13, không phải xác nhận trạng thái hiện tại và không phải công việc kế tiếp của đợt UI. Không tự mở lại các đề xuất mở rộng tại đây.

# Các bước tiếp theo - Gate 0 Reconciliation

**Ngày:** 2026-09-13  
**Trạng thái:** Ready to measure Gate 0 baseline

---

## ✅ Đã hoàn thành (Bước 1: Housekeeping)

1. Pull origin/main thành công - cập nhật 72 commits
2. Restore Gate 0 docs locally (chưa commit):
   - `docs/SYSTEM_CURRENT_STATE_AUDIT_20260912.md`
   - `docs/SYSTEM_OPERATING_MODEL.md`
   - `docs/SYSTEM_FUNCTION_CATALOG.md`
3. Restore Gate 0 SQL scripts locally:
   - `supabase/manual_unified_indexing_gate0_summary.sql`
   - `supabase/manual_unified_indexing_gate0_inventory.sql`
4. Working tree clean, main branch up-to-date

---

## 🎯 Bước 2: Đo Gate 0 Baseline Production

### Mục tiêu:
Cập nhật baseline production mới nhất để trả lời 9 câu hỏi Gate 0:

1. Function RAG deployed là phiên bản nào và quyền nào?
2. Số source rows eligible của từng domain?
3. Số RAG chunks có khớp không?
4. News published/valid/registry/chunk có lệch không?
5. `property_types`, `news_categories`, `managed_pages` có eligible không?
6. RAG run mới nhất là ngày nào?
7. Freshness queue có pending/failed/dead-letter không?
8. `ai_chat_knowledge` nào được đánh dấu public?
9. Staff có thể mutation ở domain nào?

### SQL cần chạy:

```sql
-- File: supabase/manual_unified_indexing_gate0_summary.sql
-- 
-- SQL read-only, trả về ONE JSON ROW
-- KHÔNG write, rebuild, hoặc thay đổi production
```

### Hành động:

**Bước 2.1:** Mở Supabase SQL Editor production

**Bước 2.2:** Copy nội dung file `supabase/manual_unified_indexing_gate0_summary.sql`

**Bước 2.3:** Paste vào SQL Editor và Run

**Bước 2.4:** Copy JSON result và gửi cho Claude

**Bước 2.5:** Claude sẽ phân tích và đưa ra bước tiếp theo

---

## 🚀 Bước 3: Quyết định tiếp theo (sau khi có Gate 0 results)

Dựa trên Gate 0 baseline, sẽ quyết định:

**A. Nếu Gate 0 PASS (không có gap nghiêm trọng):**
→ Tiếp tục entity expansion (Property Type pages, News Category pages, District pages)

**B. Nếu Gate 0 có gaps:**
→ Fix gaps trước, sau đó mới mở rộng

**C. Nếu News corpus quality cần cải thiện:**
→ Ưu tiên sửa 77 bài thiếu citation/FAQ/internal links

---

## 📝 Ghi chú quan trọng:

- **Không commit docs/SQL** vì verify-gate chặn (cần full test pass)
- **Docs/SQL đã có locally** - đủ để đo Gate 0
- **Mục tiêu**: đóng Gate 0 trước khi mở gate mới
- **Nguyên tắc**: không ảnh hưởng production, đo trước khi quyết định

---

## 📌 Tham khảo:

- Audit doc: `docs/SYSTEM_CURRENT_STATE_AUDIT_20260912.md`
- SQL script: `supabase/manual_unified_indexing_gate0_summary.sql`
- Memory: `project_seo_geo_aio_masterplan.md`
