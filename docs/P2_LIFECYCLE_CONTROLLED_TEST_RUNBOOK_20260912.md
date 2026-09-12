# P2 lifecycle controlled test runbook

> Phạm vi: chỉ đo `seo_freshness_jobs` cho `create` và `delete` bằng một Product
> fixture disposable. Không dùng dữ liệu khách hàng thật và không INSERT trực tiếp
> bằng SQL.

## Vì sao phải dùng Admin UI

`createProperty()` và `deleteProperty()` gọi `/api/admin/revalidate-content`, rồi
server mới gọi `propagatePublicIndexing()` để revalidate path và enqueue freshness
jobs. INSERT/DELETE trực tiếp trong Supabase SQL sẽ bỏ qua đường propagation này và
không phải là một controlled end-to-end test.

## Preconditions

- Owner/admin xác nhận một fixture hoàn toàn disposable.
- Dùng Product, không dùng News draft: `createNews()` cố ý tạo News ở trạng thái
  draft nên không tạo public paths cho action `create`.
- Dùng marker trong slug, ví dụ `codex-lifecycle-20260912`.
- Không điền tên, điện thoại, địa chỉ hoặc hình ảnh của khách hàng thật.
- Với test freshness an toàn, để `Đang hiển thị` tắt (`is_active = false`) để fixture
  không xuất hiện trên public listing. Product create/delete vẫn đi qua queue path
  propagation; Search Visibility sync chỉ chạy khi public impact là true.

## Test `create`

1. Mở Admin UI → Products/Properties → tạo Product mới.
2. Đặt slug có marker rõ ràng, ví dụ `codex-lifecycle-20260912`.
3. Tắt `Đang hiển thị`, điền dữ liệu synthetic được owner duyệt.
4. Ghi lại thời điểm UTC ngay trước thao tác lưu (`T_create`), sau đó mới bấm lưu.
5. Chờ freshness worker xử lý job.
6. Mở `supabase/manual_p2_freshness_lifecycle_measurement.sql`; thay
   `now() - interval '24 hours'` bằng `T_create` (hoặc timestamp sớm hơn vài giây),
   rồi chạy read-only.
7. Kết quả cần có `event_kind = property`, `event_action = create`, status
   `succeeded`, `open_or_failed_count = 0`, và integrity checks bằng `0`.

## Test `delete`

1. Giữ nguyên đúng fixture vừa tạo; không chọn Product khác.
2. Ghi thời điểm UTC ngay trước thao tác xóa (`T_delete`).
3. Xóa fixture qua Admin UI và xác nhận hộp thoại.
4. Chờ freshness worker xử lý job.
5. Chạy lại measurement với cửa sổ bắt đầu tại `T_delete`.
6. Kết quả cần có `event_kind = property`, `event_action = delete`, status
   `succeeded`, `open_or_failed_count = 0`, và integrity checks bằng `0`.

## Nếu test lỗi

- Không retry bằng cách xóa hoặc tạo thêm nhiều bản ghi.
- Gửi JSON measurement và ID fixture để chẩn đoán.
- Nếu fixture còn tồn tại, cleanup bằng Admin UI; không dùng SQL DELETE để “bù”
  vì sẽ tạo thêm một mutation ngoài propagation contract.
- Sau cleanup, chạy preview candidate để xác nhận không còn marker fixture.

## Expected acceptance evidence

- `create` và `delete` đều xuất hiện trong các cửa sổ đo chính xác.
- Mỗi action có freshness jobs `succeeded`; không có pending/processing/failed/
  dead-letter hoặc lock integrity error.
- Không coi queue success là bằng chứng Google đã crawl/index.
- RAG vẫn deferred; không gọi `refresh_rag_index`.
