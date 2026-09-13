# Chuẩn hóa cấu trúc Giải thưởng & Chứng nhận

## Mục tiêu

Sửa khối “Giải thưởng & Chứng nhận” ở phần liên hệ của trang **Về chúng tôi** (`/ve-chung-toi`) để nó không còn là một danh sách văn bản một tầng. Nội dung sẽ được quản trị bằng biểu mẫu rõ ràng và hiển thị dưới dạng thẻ chứng thực có đủ ngữ cảnh, chỉ xuất hiện khi có dữ liệu nguồn hợp lệ.

## Phát hiện đã xác nhận

- Đây là khối `about.awards`, đặt ở cột phải ngay dưới thông tin liên hệ trong [AboutPage.tsx](../../src/screens/AboutPage.tsx).
- Cấu trúc hiện có không đồng bộ: admin coi `awards/items` là collection JSON, trong khi trang công khai lại cắt trực tiếp giá trị theo dòng mới. Khi admin lưu collection JSON, trang công khai sẽ coi toàn bộ JSON là một mục danh sách, nên hiển thị sai cấu trúc.
- Schema hiện chỉ có trường `text`, nên không lưu được đơn vị cấp, năm, nguồn chứng minh hay ảnh chứng nhận.
- Dữ liệu seed cũ chứa ba tuyên bố không có URL nguồn. Không được chuyển chúng thành khẳng định công khai theo cấu trúc mới; khi migration chạy, chúng phải trở thành dữ liệu nháp/không hiển thị cho đến khi quản trị viên bổ sung nguồn.
- Kiểm tra Chrome local đã bị chặn bởi các yêu cầu `page_blocks` trả 400 từ môi trường local hiện tại; chưa thể dùng nó để kết luận giao diện sau thay đổi. Sau khi triển khai, phải kiểm tra bằng Chrome với môi trường có dữ liệu CMS hoạt động.

## Thay đổi thực hiện

1. **Chuẩn hóa schema collection của `about.awards.items`** trong [pageContentSchema.ts](../../src/lib/pageContentSchema.ts)
   - Mỗi mục sẽ có: `title` (bắt buộc), `issuer`, `year`, `description`, `image`, `source_url` (bắt buộc).
   - Điều chỉnh nhãn và mô tả admin để nói rõ: URL nguồn là bắt buộc, ảnh là bằng chứng trực quan tùy chọn, chỉ công bố mục đã có bằng chứng.
   - Viết parser chuyển tiếp cho legacy list chỉ để admin có thể nhìn/chỉnh dữ liệu cũ, không làm dữ liệu thiếu nguồn được công khai.

2. **Cập nhật public rendering** trong [AboutPage.tsx](../../src/screens/AboutPage.tsx)
   - Đọc awards qua `collection('awards', 'items')`, tuyệt đối không `split('\n')`.
   - Lọc thêm ở frontend để chỉ render các mục có `title` và `source_url` hợp lệ, phòng dữ liệu cũ/malformed.
   - Hiển thị dạng danh sách thẻ: ảnh/logo (nếu có), tên, đơn vị cấp + năm, mô tả, liên kết “Xem nguồn xác minh” mở tab mới kèm bảo vệ `rel="noreferrer"`.
   - Khối phần liên hệ chỉ xuất hiện khi còn ít nhất một chứng nhận đã xác minh; không để tiêu đề hoặc khung rỗng.
   - Dùng key ổn định, alt text mô tả không bịa thêm dữ kiện, và layout responsive không tràn ngang.

3. **Chuyển đổi an toàn dữ liệu database**
   - Viết migration mới, idempotent, để đổi `about.awards/items` về JSON collection khi dữ liệu legacy còn tồn tại.
   - Không tự tạo `source_url`; mục legacy thiếu bằng chứng sẽ chuyển vào cấu trúc có trường nguồn trống để admin xử lý, và do frontend gate sẽ không được public.
   - Cập nhật label/type của block thành collection.
   - Viết SQL dry-run chỉ đọc để đo: giá trị legacy/JSON, số mục có/thiếu nguồn, và preview các mục sẽ hiển thị sau conversion.
   - Không tự chạy production SQL. Báo người dùng chạy migration + dry-run, sau đó truy vấn read-only để xác nhận.

4. **Bảo vệ bằng kiểm thử**
   - Mở rộng [pageContentSchema.test.ts](../../src/lib/pageContentSchema.test.ts) với định dạng award mới, thiếu `source_url`, và legacy conversion.
   - Bổ sung test helper thuần cho gate hiển thị/source URL nếu logic cần tách ra từ component.
   - Đảm bảo tests chứng minh JSON không còn bị render như một chuỗi đơn lẻ.

5. **Xác minh và chất lượng**
   - Chạy typecheck, toàn bộ Vitest, production build.
   - Chạy `graphify update .` sau sửa code.
   - Mở `/ve-chung-toi` bằng Chrome tại desktop và mobile trong môi trường CMS khả dụng; kiểm tra thẻ award, link nguồn, trạng thái không có dữ liệu, và không tràn ngang. Không kiểm chứng admin nếu chưa đăng nhập.
   - Ghi verify-gate receipt với các giới hạn runtime thực tế.
   - Không commit/push khi chưa có phê duyệt push riêng.

## Tệp dự kiến

- `src/lib/pageContentSchema.ts`
- `src/lib/pageContentSchema.test.ts`
- `src/screens/AboutPage.tsx`
- `supabase/migrations/<timestamp>_about_awards_structured_evidence.sql`
- `supabase/manual_about_awards_structured_evidence_dry_run.sql`
- Có thể thêm một helper/test file nếu cần tách display gate để kiểm thử; tránh sửa file không liên quan.
