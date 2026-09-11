# Batch A2 — News corpus quality readiness

**Ngày:** 2026-09-11  
**Trạng thái:** A2 baseline đã được manual redeploy và hậu kiểm production 2026-09-11. Follow-up actionable blocker đang chờ push production.
**Phụ thuộc:** Batch A1 DONE (boundary enforce + quality gate + bài mẫu đăng lại thành công).  
**Không làm:** Search Console/GA4 (DEFERRED), sitemap shard, đổi `NEWS_PUBLISH_BOUNDARY_MODE`, đổi rule từ khóa AIO, tự rewrite nội dung bài.

## Vì sao đây là việc tiếp theo

SOT P8 vẫn `PARTIAL`. Gap còn lại sau A1:

- internal-link coverage trên **toàn corpus** (field `news.content`, không phải chrome trang)
- structured location fill (`area_id` / `district_id` / …) — schema đã có từ `20260908000000_news_structured_location.sql`
- image/semantic HTML cleanup phải dựa trên measurement

Horizon 4 TODO #3: đồng bộ canonical, internal links, sitemap và JSON-LD.

Đã đo production 2026-09-11 (HTTP, không SQL):

- `/sitemap.xml`: **172** URL unique, **79** news detail. Cách hard-cap 50k rất xa → **không** làm Batch C sitemap shard.
- 20 bài public đều có ≥2 `href="/..."` trong `<article>`, nhưng `/tin-tuc` (rail liên quan) xuất hiện ở cả 20 bài → **không** dùng số này để kết luận cổng chất lượng.
- Cổng A1 đếm `href="/..."` trong **cột content**. Ẩn rồi đăng lại 78 bài còn lại có thể bị chặn giống bài mẫu nếu content thiếu link tương đối.


## Kết quả SQL production 2026-09-11

User chạy `manual_a2_news_quality_corpus_dry_run.sql`:

- 80 bài (79 published, 1 draft), 80 có `content_version`.
- `news_publication_events`: 4 (2 publish / 2 unpublish) — đúng vòng bài mẫu.
- Freshness news: 70/70 succeeded.
- Structured location: 18/79 có `area_id`; 0 district; 0 neighborhood.
- Proxy SQL: 38 thiếu `<a href="/...">` trong content; 48 citation ngoài 2–6; 40 FAQ ngoài 4–6; 9 keyword < 3.
- `H2_COUNT` 79/79 **không tin**: Postgres POSIX `\b` là backspace. Bài vừa đăng có ≥4 H2 HTML trên trang. UI A2 dùng `evaluateArticleIngestQuality`, không dùng proxy H2.

## Mục tiêu

Cho owner thấy **trước** bài nào sẽ fail cổng nếu đăng lại, theo đúng rule A1, một lần, đủ mã lỗi.

Không tự chèn link, không tự publish, không đụng bài đang live.

## Thứ tự bắt buộc

1. User chạy SQL read-only `supabase/manual_a2_news_quality_corpus_dry_run.sql`.
2. Dán kết quả vào chat. Agent đối chiếu với rule `src/lib/articleIngestQuality.ts` (min 3 cụm từ khóa, không trần 3–6, ≥2 `href="/..."`, FAQ 4–6, citation 2–6).
3. Chỉ sau khi có số: admin “Sẵn sàng đăng lại” — liệt kê blocker theo bài, không chặn lưu bài đã public (A1 đã vậy).
4. Verify Chrome: `/quyen-chu-he-thong` → MFA → `/quantrihethong/news`. Không kết luận bằng curl.
5. Docs SOT/CHANGELOG khi DoD đạt. **Không push** trừ khi user nói push.

## Ngoài scope

- `SITEMAP_MANIFEST_MODE` / `FRESHNESS_COALESCE_MODE` (flag Batch 0, chưa khẩn vì 172 URL).
- Entity expansion (đường/KCN/CĐT) — P2, SOT cấm SEO entity trước structured data depth.
- Rail BĐS theo taxonomy: code đã có; A2 chỉ đo `area_id` fill-rate, không làm picker mới trừ khi SQL cho thấy đây là blocker chính.
- Batch B performance (homepage ~12 MB ảnh) — P16, không phải P8 news.

## DoD

- [x] Có bảng production: SQL proxy + Chrome local 77/79 published fail cổng đăng lại; top mã SQL: citation, FAQ, internal link.
- [x] Admin hiện đủ blocker một lần khi xem bài đã đăng (không cần ẩn bài mới thấy).
- [x] Không đổi gate, không đổi enforce, không mutate content.
- [x] Verify-gate + graphify nếu có sửa `src/` / `app/`.


## Follow-up — blocker phải dễ sửa (2026-09-11)

Phát hiện khi hậu kiểm production: quality gate chặn đúng các cụm từ khóa bị trùng,
nhưng câu báo lỗi cũ chỉ hiển thị tổng số cụm nên người dùng khó hiểu vì sao `48 > 3`
vẫn bị chặn. Follow-up giữ nguyên rule, chỉ làm rõ chẩn đoán và rút ngắn đường sửa.

- [x] Tách message thiếu số lượng và message bị trùng keyword.
- [x] Hiển thị tổng số cụm, số cụm không trùng và số cụm bị lặp.
- [x] Thêm `Sửa mục này` trong danh sách blocker để focus/scroll tới field tương ứng.
- [x] Gắn target cho title, slug, excerpt, image, GEO, FAQ, citations, content và SEO fields.
- [x] Test quality message và mapping blocker → field.
- [x] Full Vitest, typecheck, build, diff check, graphify và verify receipt.
- [ ] Commit follow-up scoped.
- [ ] Push/deploy đúng production target.
- [ ] Hậu kiểm Chrome production: message duplicate keyword và nút `Sửa mục này`.

## Công việc kế tiếp sau follow-up

1. Không rewrite hàng loạt 77 bài live; chỉ dùng blocker để owner xử lý theo ưu tiên.
2. Sau khi production pass, đo lại nhóm lỗi theo code và chọn nhóm có tác động lớn nhất.
3. Chỉ sau đó mới mở Horizon 4 TODO #3: canonical, internal links, sitemap và JSON-LD;
   không làm sitemap shard khi inventory vẫn chỉ 172 URL.
