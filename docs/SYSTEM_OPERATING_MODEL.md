# Chợ Nhà Việt — System Operating Model

> Trạng thái: `APPROVED DIRECTION — IMPLEMENTATION GATED`
>
> Ngày phê duyệt định hướng: 2026-09-11
>
> Phạm vi: cách lập kế hoạch, kiểm tra, nâng cấp, ghi nhận production evidence
> và đào tạo người kế thừa cho hệ thống Product/News/Taxonomy/CMS/SEO/AIO.

## 1. Nguyên tắc bất biến

1. **Không tự quyết thay chủ sản phẩm.** Mọi thay đổi kiến trúc, permission,
   public boundary, migration và push phải có phương án để user duyệt trước.
2. **Tách hiện trạng khỏi kế hoạch.** Luôn ghi rõ `Current`, `Verified`,
   `Proposed`, `Approved`, `Deployed`, `Superseded`.
3. **Production database là bằng chứng cao nhất.** Migration trong Git không có
   nghĩa là đã chạy production.
4. **User/staff nhập nghiệp vụ; hệ thống sinh SEO kỹ thuật.** Không bắt nhân viên
   tự viết canonical, JSON-LD, sitemap hoặc RAG chunk.
5. **Không để lỗi downstream làm mất dữ liệu.** SEO/RAG/Search Console có queue,
   trạng thái và retry; chỉ lỗi safety/canonical nghiêm trọng mới chặn publish.
6. **Không tạo chức năng trùng.** Trước khi thêm module/table/queue/RPC phải tìm
   implementation hiện có bằng catalog, graphify, grep có phạm vi và tests.
7. **Không nói “đã index Google/AIO bên ngoài” nếu chỉ có sitemap/RAG nội bộ.**
8. **Không dùng dữ liệu private cho public AIO.** `admin_documents` và knowledge
   chưa được đánh dấu public phải giữ private.

## 2. Định hướng đã được duyệt

Định hướng baseline đã duyệt:

```text
Hybrid permission theo rủi ro
+ queue/retry hybrid
+ SEO/canonical/schema do hệ thống sinh
+ public AIO chỉ lấy public canonical hợp lệ
+ knowledge phải có phân loại public
+ indexing/rebuild qua server boundary
+ triển khai theo vertical slice
```

Đây là định hướng. Chưa coi mọi chi tiết code/migration hiện tại là đã phù hợp
cho đến khi từng gate được kiểm tra.

## 3. Phân biệt trạng thái công việc

| Trạng thái | Ý nghĩa |
|---|---|
| `DISCOVERED` | Đã thấy trong code/data, chưa đánh giá |
| `MEASURED` | Có số liệu read-only |
| `PROPOSED` | Có phương án nhưng chưa được duyệt |
| `APPROVED` | User đã duyệt hướng/phạm vi |
| `IMPLEMENTING` | Đang sửa code/migration theo scope |
| `LOCALLY_VERIFIED` | Test/typecheck/build/browser đạt |
| `PRODUCTION_PENDING` | Chờ user chạy SQL/deploy |
| `PRODUCTION_VERIFIED` | Có output verify production |
| `DONE` | Đủ Definition of Done |
| `SUPERSEDED` | Bị thay thế bởi contract/plan mới |
| `BLOCKED` | Bị chặn bởi evidence hoặc quyết định chưa có |

## 4. Quy trình trả lời một câu hỏi hệ thống

Khi user hỏi “chức năng X nằm ở đâu/làm gì/có lỗi không/nâng cấp thế nào”:

1. Xác định domain: Product, News, taxonomy, CMS, SEO, Search Visibility,
   freshness, AIO/RAG, permission hoặc public route.
2. Chạy `graphify query` cho câu hỏi; dùng `graphify path` nếu cần tracing.
3. Mở `docs/SYSTEM_FUNCTION_CATALOG.md`.
4. Liệt kê current files, route/API/server function/table/migration/test.
5. Kiểm tra evidence hiện có; không suy đoán production.
6. Trả lời theo ba phần ngắn:
   - Hiện đang có gì;
   - Khoảng trống/rủi ro;
   - Các phương án và khuyến nghị.
7. Chờ user duyệt trước khi sửa.

## 5. Quy trình lập và duyệt thay đổi

```text
Question / problem
→ read-only measurement
→ current-state map
→ options + trade-offs + affected files
→ user approval
→ contract update
→ implementation batch
→ tests + browser + graphify
→ production dry-run
→ user runs SQL/deploy
→ production verify
→ user approves commit/push
```

Không được bỏ qua bước `current-state map` vì plan cũ, code mới và migration có
thể cùng tồn tại nhưng không cùng là production truth.

## 6. Permission và lifecycle baseline

### User

- Tạo/sửa dữ liệu thuộc quyền sở hữu.
- Lưu draft và gửi duyệt.
- Không tự sửa SEO kỹ thuật, canonical, RAG hoặc Search Console.

### Staff

- Nhập/sửa dữ liệu theo module và scope được cấp.
- Có thể xử lý review nếu có permission.
- Publish trực tiếp chỉ khi có permission riêng được chốt.

### Admin/Owner-MFA

- Quản lý policy, taxonomy, publish/unpublish, SEO override và production
  evidence.
- Rebuild/index thủ công phải đi qua server boundary và audit.

### System

- Derive slug/canonical/metadata/schema.
- Revalidate public routes.
- Enqueue freshness.
- Sync Search Visibility.
- Build public AIO/RAG.
- Retry và báo degraded.

## 7. Quy tắc không phá vỡ hệ thống

- Không sửa trực tiếp nhiều domain trong một batch nếu không có dependency map.
- Một batch phải có write-set rõ: files được phép thay đổi và files ngoài scope.
- Không dùng `git add .`, `git reset --hard`, `--no-verify` hoặc `--force`.
- Không stage file user khác ngoài scope.
- Không xóa migration cũ chỉ vì có migration mới; phải có compatibility/rollback.
- Không tạo tên table/RPC/queue mới nếu chức năng tương đương đang tồn tại.
- Không gắn status `DONE` chỉ vì local build passed.

## 8. Worktree và phân mảnh chức năng

### Phân mảnh theo capability, không phân mảnh theo bản sao dữ liệu

Các boundary hợp lý:

```text
01-content-source
02-public-routes-seo
03-public-indexing
04-search-visibility
05-aio-rag
06-permission-lifecycle
07-observability-runbooks
```

Mỗi boundary có:

- code owner/primary files;
- source tables;
- API/server functions;
- tests;
- SQL verify;
- acceptance criteria;
- dependency vào boundary khác.

### Quy tắc worktree

- Worktree production/release chỉ dùng để review/release, không sửa thử.
- Mỗi batch lớn dùng worktree/branch riêng nếu repository workflow cho phép.
- Một worktree chỉ có một mục tiêu và một write-set.
- Không dùng worktree để che dirty files; trước khi làm phải ghi baseline
  `git status --short`.
- Sau batch phải ghi changed files, tests, evidence, unresolved items.
- Chỉ hợp nhất sau khi review diff theo file cụ thể.

Không tự tạo hoặc xóa worktree nếu user chưa yêu cầu; tài liệu này chỉ quy định
cách làm khi bắt đầu batch mới.

## 9. Production SQL và external systems

- Agent chỉ viết migration/dry-run/verify.
- User tự chạy SQL production.
- Sau khi user báo đã chạy, phải dùng output để đối chiếu; không mặc định thành
  công chỉ vì Supabase báo `Success`.
- Google Search Console submit/inspection là evidence riêng.
- RAG nội bộ có thể kiểm soát eventual consistency; AIO bên thứ ba không thể
  được cam kết index tức thời.

## 10. Documentation/training protocol

Mỗi chức năng mới hoặc thay đổi lớn phải ghi:

- Tên chức năng và mục đích;
- người sử dụng/permission;
- UI/API/server function/table;
- public/private boundary;
- input/output và side effects;
- lỗi và retry;
- migration/rollback;
- tests và verify SQL;
- ví dụ thao tác cho nhân viên;
- trạng thái current/production.

Tài liệu nhân viên tương lai nên được viết từ catalog này, không viết lại một
bản mô tả độc lập dễ lệch khỏi code.

## 11. Scope hiện tại — 2026-09-12

RAG đang `DEFERRED` theo quyết định của user. Thứ tự ưu tiên hiện tại là:

```text
SEO → Search → AIO runtime → Analytics → verification
```

Không triển khai `refresh_rag_index`, backfill `rag_chunks`, knowledge
classification hoặc RAG queue mới trong scope này. Muốn mở lại RAG phải có
quyết định riêng sau khi các gate SEO/Search/AIO/Analytics đạt.

Chi tiết: [seo-search-aio-analytics-first.md](file:///Users/macbucdatle/Desktop/project/.claude/plans/seo-search-aio-analytics-first.md).
