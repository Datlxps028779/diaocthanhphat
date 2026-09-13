# News publication quality — prevention and boundary audit TODO

> Ngày lập: 2026-09-13
>
> Trạng thái: `SUPERSEDED — KHÔNG PHẢI PARENT PLAN ĐIỀU HÀNH`
>
> Mục tiêu: bảo đảm bài News mới có luồng lưu/đăng rõ ràng, không tái diễn lỗi
> kỹ thuật; không biến kết quả đo corpus cũ thành yêu cầu rewrite hàng loạt.

> Ghi chú: Đây là ghi chú kỹ thuật phát sinh trong quá trình audit, không phải kế
> hoạch được duyệt độc lập. Không dùng file này để mở phase hoặc thay đổi thứ tự
> công việc; parent plan duy nhất là [`unified-public-indexing-rollout-todo.md`](unified-public-indexing-rollout-todo.md).

## 1. Kết luận đầu vào đã có

Kết quả từ
[`manual_a2_news_quality_corpus_dry_run.sql`](../../supabase/manual_a2_news_quality_corpus_dry_run.sql)
trên production:

- 80 News đang published, 0 draft, 80/80 có `content_version`.
- Proxy republish cho thấy 75/80 bài sẽ có ít nhất một blocker nếu bị đăng lại.
- Các blocker lớn nhất: `EXCERPT_LENGTH` 51, `CITATION_COUNT` 48,
  `FAQ_COUNT` 40, `INTERNAL_LINK_COUNT` 38.
- Các số này chồng lấn theo bài và chỉ mô tả khả năng fail khi đăng lại.
- Đây không phải bằng chứng 75 bài đang hỏng trên public route.

Slug, canonical, Search Visibility registry và constraint slug đã được xử lý
riêng và không nằm lại trong TODO này.

## 2. Hướng làm đúng sau khi reset scope

### Mục tiêu kỹ thuật

1. Bài mới phải được lưu nháp mà không bị chặn bởi quality gate publish.
2. Khi owner publish, hệ thống phải kiểm tra đúng một contract và trả đủ blocker
   theo từng field, không báo lỗi mơ hồ.
3. Bài đang live không bị ảnh hưởng chỉ vì corpus cũ không đạt chuẩn republish.
4. Không tạo pipeline/API/RPC/queue thứ hai.
5. Phần tích hợp mở rộng được tách thành hạng mục độc lập, chỉ đấu nối sau khi
   hạ tầng nền và các lỗi hiện tại đã được xử lý đầy đủ.

### Không làm trong batch này

- Không bulk rewrite hoặc tự chèn FAQ/citation/internal links cho 80 bài.
- Không unpublish 75 bài đang live.
- Không nới lỏng quality gate chỉ để làm đẹp số liệu.
- Không thay đổi production SQL trực tiếp.
- Không thêm migration nếu audit không chứng minh có schema gap.
- Không dùng kết quả SQL proxy để khẳng định chính xác mọi edge case của TypeScript.
- Không đấu nối phần tích hợp mở rộng khi nền tảng chưa đạt acceptance.

## 3. Thứ tự bắt buộc

### Bước A — Map boundary hiện tại

Đọc và lập sơ đồ một lần cho đường:

`NewsTab.tsx → articleIngestQuality.ts/newsAdminSaveIssues.ts → news API →
publication RPC/server boundary → revalidation/Search Visibility`

Phải ghi rõ cho từng đường:

- lưu draft;
- cập nhật bài đang published;
- publish lần đầu;
- republish;
- unpublish;
- lỗi trả về UI;
- side effect sau commit.

### Bước B — Đối chiếu contract, không đổi rule

Đối chiếu proxy SQL với implementation TypeScript hiện tại, tối thiểu:

- focus keywords: số lượng và trùng lặp;
- FAQ: khoảng 4–6;
- citations: khoảng 2–6;
- internal links: tối thiểu 2 `href="/..."`;
- title/excerpt/meta/GEO/image/author;
- slug và trạng thái published.

Phân loại sai lệch thành `SQL proxy`, `UI message`, `server enforcement` hoặc
`thực sự là code defect`. Chưa được sửa ngưỡng chỉ vì số lượng corpus cao.

### Bước C — Xử lý lỗi nền và regression tests

Ưu tiên các lỗi nhỏ ảnh hưởng trực tiếp đến thao tác owner:

- draft thiếu quality fields vẫn lưu được;
- publish draft thiếu fields bị chặn với blocker theo field;
- bài đạt contract publish thành công;
- sửa một field chỉ xoá đúng blocker tương ứng;
- cập nhật bài đang live không tự unpublish;
- lỗi publish không làm client báo thất bại khi transaction đã commit;
- slug mới luôn đạt public slug contract;
- lỗi auth/session/API có thông báo rõ ràng, không yêu cầu thao tác vòng vo.

Mỗi lỗi chỉ được sửa sau khi xác định đường hiện tại và có test hồi quy tương ứng.

### Bước D — Browser verification

Dùng Chrome thật, không dùng `curl` để kết luận UI:

- mở `/quyen-chu-he-thong` → MFA → `/quantrihethong/news`;
- kiểm tra một draft test hoặc bài test được phép sửa;
- xác nhận lưu draft, hiển thị blocker và thao tác `Sửa mục này`;
- không mutate bài live nếu chưa có phê duyệt riêng.

Ghi verify receipt với trang đã mở, số đo và phần chưa kiểm được.

### Bước E — Chỉ sau khi nền tảng ổn định mới mở hạng mục tích hợp riêng

Hạng mục tích hợp mở rộng không thuộc write-set hiện tại. Chỉ lập kế hoạch đấu
nối sau khi các acceptance criteria của batch này đạt và người dùng duyệt riêng.

## 4. Kết quả Bước A — map boundary hiện tại (2026-09-13)

### Đường lưu nháp và cập nhật nội dung

- `NewsTab.tsx:408-489` chạy preflight ở client. Quality gate chỉ được bật
  khi đang chuyển từ draft sang publish; bài đang live vẫn được lưu phần biên tập.
- `NewsTab.tsx:1044-1080` tạo mới luôn gọi `createNews(... is_published: false)`,
  sau đó mới gọi publication route nếu người dùng yêu cầu publish. Khi sửa bài,
  `updateNews` lưu phần nội dung trước; thay đổi trạng thái được gọi riêng sau đó.
- `newsAdminSaveIssues.ts:138-183` kiểm tra title/slug khi save; chỉ khi
  `publish: true` mới chạy quality contract đầy đủ.
- `src/lib/api/news.ts:259-296` dùng browser Supabase để insert/update nội dung,
  loại `is_published` khỏi editorial update và gọi `/api/admin/revalidate-content`.

### Đường publish/unpublish

- `src/lib/api/news.ts:140-158` gọi `/api/admin/news/:id/publish` với Bearer
  session và `expectedContentVersion`.
- `app/api/admin/news/[id]/publish/route.ts:188-285` yêu cầu owner MFA, đọc lại
  row, tạo quality report server-side, chặn publish ở HTTP 422 nếu report fail,
  rồi gọi service-role RPC.
- `publish_news_article_server` kiểm tra service role, actor admin, khóa row,
  kiểm tra `content_version`, xác nhận quality report, kiểm tra citation bằng SQL,
  cập nhật trạng thái và ghi `news_publication_events` trong cùng transaction.
- Unpublish không chạy quality gate; vẫn đi qua owner/version/RPC boundary.

### Side effects sau commit

Sau khi publication thay đổi, route gọi propagation chung. Propagation hiện gồm:

1. revalidate các public paths;
2. queue freshness;
3. đồng bộ Search Visibility;
4. một hạng mục tích hợp mở rộng đang được gọi trong cùng orchestration.

Hạng mục thứ tư phải được tách khỏi đường News trong một batch riêng sau khi nền
tảng ổn định. Không xử lý nó trong TODO hiện tại.

## 5. Quyết định scope đã chốt

- Giữ nguyên transaction publish, freshness và Search Visibility hiện có.
- Không sửa quality thresholds trong batch này.
- Không sửa dữ liệu News production.
- Không thêm migration hoặc queue mới nếu chưa có bằng chứng schema gap.
- Tách hạng mục tích hợp mở rộng khỏi batch hiện tại; chỉ đấu nối sau khi hạ tầng
  triển khai đầy đủ và các lỗi nền đã được đóng.
- Không code phần tích hợp mở rộng trong batch này.

## 6. Acceptance criteria

- [ ] Boundary lưu draft/publish/republish/unpublish được lập đầy đủ.
- [ ] SQL proxy và TypeScript contract được đối chiếu, không còn kết luận lẫn
      giữa proxy và enforcement.
- [ ] Có regression tests cho draft, publish fail, publish pass và live update.
- [ ] Browser thật xác nhận UI blocker theo field.
- [ ] Các lỗi auth/session/API được ghi nhận và xử lý theo thứ tự ưu tiên.
- [ ] Không bulk mutate dữ liệu News production.
- [ ] Phần tích hợp mở rộng chưa được đấu nối trong batch này.
- [ ] Nếu có sửa source: chạy typecheck, Vitest, build, `git diff --check`,
      `graphify update .` và verify receipt.
- [ ] Chỉ push khi user cấp quyền riêng cho lần push đó.

## 7. Trạng thái và việc tiếp theo

Bước A đã hoàn tất. Việc tiếp theo là Bước B–C: đối chiếu contract và xử lý các
lỗi nền có bằng chứng. Không chạy thêm SQL corpus, không sửa hàng loạt dữ liệu và
không đấu nối hạng mục tích hợp mở rộng.

Các file cần xem trước khi code:

- `src/components/admin/tabs/NewsTab.tsx`
- `src/lib/articleIngestQuality.ts`
- `src/lib/newsAdminSaveIssues.ts`
- `src/lib/api/news.ts`
- `src/lib/server/contentRevalidation.ts`
- publication boundary migrations/RPC hiện có

## 8. Implementation slice — 2026-09-13

Đã hoàn tất phần tách hạng mục mở rộng khỏi propagation nền:

- [x] `src/lib/server/publicIndexing.ts` chỉ còn revalidate public paths, queue
      freshness và đồng bộ Search Visibility.
- [x] `PublicIndexingPropagation` không còn trả trường của hạng mục mở rộng.
- [x] `src/lib/api/news.ts` không còn quảng bá trường kết quả đó trong
      `NewsPublicationResult`.
- [x] Cập nhật `src/lib/server/publicIndexing.test.ts` để khóa contract mới và
      giữ test degraded evidence.
- [x] Không sửa schema, migration, dữ liệu production hoặc nội dung News.
- [x] Không thay đổi quality threshold và không tạo pipeline mới.

### Verification evidence

- Focused tests: 3 test files / 28 tests passed.
- Full Vitest: 200 test files / 1,556 tests passed.
- Typecheck: passed.
- Production build: completed successfully; static data fetch có cảnh báo DNS
  local tới Supabase nhưng build vẫn hoàn tất.
- `git diff --check`: passed.
- `graphify update .`: completed.
- Verify receipt: đã ghi sau khi mở bằng Chrome thật route News public trên cổng
  local tạm; HTTP 200, canonical đúng và có 4 JSON-LD.

### Chưa kiểm được

- Luồng Admin/MFA đầy đủ chưa được thao tác trong browser ở slice này.
- Chưa có mutation production.
- Chưa push commit.

## 9. Trạng thái sau implementation slice

Phần nền đã được tách và kiểm thử cục bộ. Tạm dừng triển khai tiếp để ưu tiên
các lỗi hạ tầng khác; chỉ mở lại hạng mục tích hợp sau khi hạ tầng đạt acceptance
và người dùng duyệt riêng. Không chạy thêm SQL corpus hoặc thay đổi dữ liệu live
trong thời gian chờ.
