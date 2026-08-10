# API Make.com — tạo bài viết Tin tức

API này nhận bài viết từ Make.com và **luôn lưu dưới dạng nháp** để quản trị viên kiểm tra trước khi xuất bản.

## Endpoint

- Production: `POST https://chonhaviet.com/api/public/articles`
- Header bắt buộc:
  - `Content-Type: application/json`
  - `x-api-key: <MAKE_API_KEY>`
- Giới hạn body: 512KB theo byte UTF-8.

`MAKE_API_KEY` là bí mật máy-với-máy, tối thiểu 20 ký tự. Chỉ lưu trong biến môi trường của Vercel và Connection/Secret của Make.com; không ghi trực tiếp vào scenario, log hoặc repository.

## Cấu hình module HTTP trong Make.com

1. Chọn **HTTP > Make a request**.
2. Method: `POST`.
3. URL: `https://chonhaviet.com/api/public/articles`.
4. Thêm hai header ở trên.
5. Body type: `Raw` / `JSON (application/json)`.
6. Bật parse response để đọc `id`, `slug`, `duplicate` và mã HTTP.

## JSON mẫu

```json
{
  "external_id": "make-news:source-12345",
  "title": "Giá nhà ở Bình Dương quý III/2026",
  "content": "<p>Nội dung bài viết...</p>",
  "excerpt": "Tóm tắt ngắn của bài viết.",
  "category": "Thị trường",
  "author": "Ban biên tập",
  "image_url": "https://example.com/images/binh-duong.jpg",
  "meta_title": "Giá nhà ở Bình Dương quý III/2026",
  "meta_description": "Tổng hợp dữ liệu và diễn biến giá nhà ở Bình Dương.",
  "focus_keywords": ["giá nhà Bình Dương", "thị trường bất động sản"]
}
```

## Hợp đồng field

| Field | Bắt buộc | Quy tắc |
|---|---:|---|
| `title` | Có | Chuỗi không rỗng, tối đa 300 ký tự. |
| `content` | Có | HTML hoặc text, tối đa 200.000 ký tự và toàn body không quá 512KB. |
| `external_id` | Khuyến nghị mạnh | ID ổn định của bài ở hệ thống nguồn, tối đa 200 ký tự. Dùng cùng một giá trị cho mọi lần retry. |
| `excerpt` | Không | Tối đa 500 ký tự. |
| `category` | Không | Phải khớp chính xác một nhãn đang có trong Admin > Danh mục tin tức. Mặc định là `Thị trường`. |
| `author` | Không | Mặc định `Ban biên tập`, tối đa 200 ký tự. |
| `image_url` | Không | URL tuyệt đối dùng `http://` hoặc `https://`; URL không hợp lệ bị bỏ qua. |
| `meta_title` | Không | Tối đa 200 ký tự. |
| `meta_description` | Không | Tối đa 400 ký tự. |
| `focus_keywords` | Không | Chuỗi phân cách bằng dấu phẩy hoặc mảng chuỗi; kết quả tối đa 200 ký tự. |

Caller không được điều khiển các field `is_published`, `slug` hoặc `views`. Nếu gửi các field này, API bỏ qua và vẫn lưu `is_published=false`.

Danh mục được đọc động từ bảng `news_categories`. Nếu gửi nhãn không tồn tại, API trả `400` cùng `allowed_categories` để scenario biết danh sách hợp lệ hiện tại.

## Idempotency và retry

`external_id` phải được tạo từ ID bất biến của bài ở nguồn, ví dụ:

```text
make-news:notion:8f3c2a
make-news:wordpress:post-12345
```

Không dùng thời gian chạy hiện tại hoặc số ngẫu nhiên cho mỗi lần retry. Khi gọi lại cùng `external_id`:

- API không tạo thêm bài;
- trả HTTP `200` với `duplicate: true`;
- cơ chế vẫn an toàn nếu hai request cùng tới đồng thời nhờ unique index trong PostgreSQL.

Nếu bỏ `external_id`, mỗi lần gọi được xem là một bài mới.

## Response

### `201 Created` — đã tạo nháp mới

```json
{
  "id": "uuid",
  "slug": "gia-nha-o-binh-duong-quy-iii-2026",
  "is_published": false,
  "duplicate": false,
  "message": "Bài viết đã lưu nháp. Vào admin để xem lại và xuất bản."
}
```

### `200 OK` — request trùng

```json
{
  "id": "uuid",
  "slug": "gia-nha-o-binh-duong-quy-iii-2026",
  "is_published": false,
  "duplicate": true
}
```

### Mã lỗi

| HTTP | Ý nghĩa | Cách xử lý trong Make.com |
|---:|---|---|
| `400` | JSON/payload sai hoặc danh mục không tồn tại. | Không retry mù; sửa mapping. Với lỗi danh mục, đọc `allowed_categories`. |
| `401` | Thiếu hoặc sai `x-api-key`. | Kiểm tra Connection/Secret. |
| `409` | Không tạo được slug duy nhất sau nhiều lần xung đột. | Báo vận hành; có thể retry có giới hạn. |
| `413` | Body lớn hơn 512KB. | Rút gọn nội dung/body trước khi gửi. |
| `500` | Lỗi ghi bài không xác định. | Retry có backoff và giữ nguyên `external_id`. |
| `503` | Server thiếu cấu hình hoặc tạm thời không kiểm tra được DB/danh mục. | Retry có backoff; kiểm tra cấu hình Vercel nếu kéo dài. |

## Sau khi API thành công

Bài chỉ xuất hiện trong khu quản trị Tin tức ở trạng thái nháp. Quản trị viên cần kiểm tra nội dung, ảnh, SEO, danh mục và chủ động xuất bản. API không tự công khai bài viết.
