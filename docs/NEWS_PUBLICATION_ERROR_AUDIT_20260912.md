# News publication error audit — 2026-09-12

**Trạng thái:** AUDIT ONLY — chưa sửa code, chưa chạy production SQL.

## Triệu chứng

`Không thể cập nhật trạng thái xuất bản.`

## Kết luận ngắn

Có ba nhóm nguyên nhân cần tách riêng:

1. **Error contract:** route gom nhiều lỗi backend thành thông báo chung; lỗi quality gate chưa trả chi tiết `quality_gate.issues` cho UI.
2. **Quyền:** route hiện dùng `requireOwner()`/owner-MFA; publication RPC còn kiểm tra `profiles.role = 'admin'`. Catalog có `news.publish` cho staff nhưng chưa nối hoàn chỉnh vào route/RPC/RLS.
3. **Partial success:** nội dung có thể đã lưu trước khi bước publish thất bại; UI cần phân biệt “đã lưu nội dung” và “chưa cập nhật trạng thái xuất bản”.

SEO/Search/AIO downstream hiện được xử lý theo trạng thái degraded và không phải nguyên nhân trực tiếp của HTTP publish failure. Tuy nhiên, luồng publish vẫn có đường gọi `refresh_rag_index`; RAG đang deferred và không thuộc B1-A.

## File/luồng cần xử lý ở slice riêng

```text
src/components/admin/tabs/NewsTab.tsx
src/lib/api/news.ts
app/api/admin/news/[id]/publish/route.ts
src/lib/server/requireAdmin.ts
src/lib/server/publicIndexing.ts
supabase/migrations/20260911010000_harden_news_publication_server_boundary.sql
```

## Chưa đủ evidence để kết luận request production cụ thể

- Chưa có response/log của request lỗi.
- Chưa xác nhận role thực tế của người thao tác.
- Chưa xác nhận biến `SUPABASE_SERVICE_ROLE_KEY` trên runtime deploy.
- Chưa xác nhận migration staff permission tương ứng đã áp dụng production.

## Đề xuất slice tiếp theo — cần approval riêng

**News Publication Error Contract & Permission Matrix**

- Bước 1: bổ sung error contract có mã + chi tiết an toàn, không lộ secret.
- Bước 2: test matrix owner/admin/staff và quality gate/RPC failure.
- Bước 3: sau khi thống nhất nghiệp vụ mới quyết định mở quyền staff; không chỉ đổi một dòng `requireOwner()`.
- Bước 4: browser verify bằng tài khoản phù hợp; production SQL chỉ do user chạy.

## Error-contract slice — triển khai 2026-09-12

**Trạng thái:** IMPLEMENTED — chưa mở quyền staff.

Đã cập nhật:

- `app/api/admin/news/[id]/publish/route.ts`
  - Trả thông báo theo mã lỗi thay vì dùng một câu chung cho mọi trường hợp.
  - `QUALITY_GATE` trả kèm `quality_gate` chi tiết khi RPC/database từ chối.
  - Lỗi server có `request_id` để tra log; không trả raw database error cho người dùng.
  - Ghi log server theo mã hỗ trợ và mã lỗi database an toàn.
- `src/lib/api/news.ts`
  - Nhận `request_id` từ API.
  - Hiển thị mã hỗ trợ trong lỗi server.
  - Có formatter riêng cho trường hợp nội dung đã lưu nhưng publication chưa hoàn tất.
- `src/components/admin/tabs/NewsTab.tsx`
  - Nếu editorial save thành công nhưng publish/unpublish thất bại, giữ bài ở trạng thái chỉnh sửa và báo rõ:
    `Đã lưu nội dung, nhưng chưa thể cập nhật trạng thái xuất bản.`
  - Không tạo lại bài mới khi người dùng sửa và thử lại.
- Regression tests cho quality gate RPC error, request id và partial-success message.

### Chưa xử lý trong slice này

- Chưa mở quyền publish cho staff.
- Chưa thay đổi `requireOwner()` hoặc publication RPC permission policy.
- Chưa chạy production SQL.
- Chưa kiểm thử admin browser bằng tài khoản owner-MFA thật.
- Chưa thay đổi RAG.

## Hotfix A — đã triển khai trong mã nguồn (2026-09-12)

**Trạng thái:** CODE READY — chưa áp dụng migration production.

### Nguyên nhân đã xác nhận

- Chrome MFA mở bài `Vốn đắt, hàng bán chậm: Áp lực dòng tiền đang đè nặng lên doanh nghiệp bất động sản`.
- Cổng đăng SEO–GEO–AIO báo `Đăng được`.
- Server log ghi request `94b2506a-259a-4a9e-a036-03c55dd15f54`, PostgreSQL `42702: column reference "id" is ambiguous`.
- Trong `publish_news_article_server`, output của `RETURNS TABLE` có cột `id`, nhưng actor guard dùng `WHERE id = p_actor_id` thay vì alias `profiles.id`.
- Bài vẫn là nháp nên URL public trả 404 theo chủ đích của `serverGetNewsByIdOrSlug` (chỉ đọc `is_published = true`). Đây không phải lỗi canonical route độc lập.

### Thay đổi đã chuẩn bị

- `supabase/migrations/20260912010000_fix_news_publication_rpc_id_ambiguity.sql`
  - Alias `profiles`, `news` trong SELECT/UPDATE.
  - Giữ nguyên signature, quality gate, service-role guard và privilege policy.
- `supabase/manual_news_publication_rpc_ambiguity_verify.sql`
  - Read-only verify function đã deploy đúng alias và quyền.
- `src/lib/api/news.ts`, `src/components/admin/tabs/NewsTab.tsx`
  - Đánh dấu partial success có cấu trúc để form format thông báo đúng một lần; không lặp mã hỗ trợ.

### Quy trình sau khi user áp dụng production migration

1. User chạy migration hotfix trong Supabase SQL Editor.
2. User chạy `manual_news_publication_rpc_ambiguity_verify.sql` và gửi toàn bộ output.
3. Chỉ sau khi xác nhận output đạt mới test publish bài nói trên.
4. Kiểm tra lại URL public, publication event và trạng thái Search/SEO downstream.
5. Không chạy RAG trong slice này.

## Hotfix B — publication boundary vs staff trigger (2026-09-12)

**Trạng thái:** CODE READY — chờ user áp dụng migration production.

### Bằng chứng runtime

- Bài mục tiêu đã đạt cổng SEO–GEO–AIO (2.121 từ, không còn blocking).
- `PATCH` lưu nội dung thành công.
- `POST /api/admin/news/:id/publish` trả `403 NOT_ALLOWED`.
- Request hỗ trợ người dùng: `c5a55706-fcc3-4c69-8384-e241ee4fb14f`.
- Log server ghi PostgreSQL `42501`, nguyên nhân: `Không có quyền chỉnh sửa trong phạm vi này`.

### Nguyên nhân

Migration `20260930050000_staff_permission_enforcement.sql` cài trigger `trg_staff_news_permission`. Trigger luôn gọi `has_staff_permission()` khi `publish_news_article_server()` cập nhật `news`. Vì RPC chạy trong service-role context, trigger không nhìn thấy scope của caller và từ chối thao tác, dù RPC đã xác thực boundary.

RPC đã đặt `app.news_publication_boundary = 'allowed'`, nhưng trigger chưa dùng cờ này.

### Bản sửa đã chuẩn bị

- `supabase/migrations/20260930090000_fix_news_publication_boundary_trigger.sql`
  - Cho phép bypass **chỉ khi** custom GUC là `allowed` và `auth.role() = 'service_role'`.
  - Giữ nguyên staff-scope checks cho browser/staff.
  - Thứ tự migration đặt sau `20260930050000_staff_permission_enforcement.sql` để không bị ghi đè.
- `supabase/manual_news_publication_boundary_trigger_verify.sql`
  - Read-only verify function, trigger, service-role guard, staff check và privilege boundary.
- `src/lib/newsPublishBoundaryMigration.test.ts`
  - Regression contract cho boundary guard.

### Quy trình triển khai

1. User chạy migration mới trong Supabase SQL Editor.
2. User chạy SQL verify và gửi toàn bộ output.
3. Chỉ khi verify đạt mới thử publish bài mục tiêu bằng Chrome.
4. Kiểm tra `is_published`, URL công khai, publication event và downstream Search/SEO.
5. Không triển khai RAG trong slice này.

### Hotfix B — production/browser verification complete

- User đã áp dụng `20260930090000_fix_news_publication_boundary_trigger.sql`.
- SQL verify đạt toàn bộ điều kiện boundary/trigger/service-role.
- Chrome thật đã publish thành công bài mục tiêu:
  - `is_published: true`
  - `content_version: 11`
  - `event_id: b95eb6cb-d197-4e2c-aa45-04ff86cae535`
  - quality gate: `passed: true`, score `94`
  - freshness: `succeeded`, queued `7`
  - Search Visibility: `succeeded`, run `f2fef6fe-18ee-4f5b-939d-d74cea617785`
  - AI index: `succeeded`, indexed `79`
- Danh sách quản trị hiển thị `Đã đăng`, `Nguồn 2/2`, `FAQ 6/6`, `Sẵn sàng đăng lại`.
- URL public render thành công bằng Chrome, không còn 404.
- Lỗi `touch_my_presence: User profile not found` vẫn là cảnh báo heartbeat riêng, không chặn publish.

## RAG follow-up boundary — 2026-09-12

News publication đã hoàn tất độc lập với RAG. Sau khi đóng lỗi publish, RAG được giữ làm đầu mối tương lai nhưng **deferred**:

- Publish News vẫn đi qua SEO/Search Visibility/freshness.
- Không để RAG refresh làm điều kiện chặn publish.
- Browser/Admin không gọi trực tiếp `refresh_rag_index`.
- Không rebuild/backfill chunk trong phạm vi P0/P1 SEO.
