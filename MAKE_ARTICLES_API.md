# API Make.com — tạo bài viết Tin tức đầy đủ SEO–GEO–AIO

API nhận bài từ Make.com, kiểm tra hợp đồng dữ liệu và cổng chất lượng `article-ingest-v1`, sau đó **luôn lưu dưới dạng nháp** để quản trị viên kiểm chứng trước khi xuất bản.

> API kiểm tra được cấu trúc, độ đầy đủ, nguồn, URL và chất lượng kỹ thuật. API không thể tự chứng minh một khẳng định là đúng chỉ từ JSON. Luồng bắt buộc vẫn là: dữ liệu nguồn đã xác minh → AI Writer → AI Fact Checker đối chiếu nguồn → API → Admin duyệt tay.

## 1. Endpoint

- Method: `POST`
- Production: `https://chonhaviet.com/api/public/articles`
- Headers:
  - `Content-Type: application/json`
  - `x-api-key: <MAKE_API_KEY>`
- Body tối đa: 512KB theo byte UTF-8.

`MAKE_API_KEY` là bí mật máy-với-máy, tối thiểu 20 ký tự. Chỉ lưu trong biến môi trường Vercel và Connection/Secret của Make.com. Không ghi key vào prompt, payload, log, Data Store hoặc repository.

## 2. Luồng scenario Make.com

```text
Nguồn dữ liệu đã kiểm chứng
→ AI Writer tạo JSON bài viết
→ AI Fact Checker nhận cả source data và draft
→ Filter: checker.passed = true
→ JSON > Create JSON
→ HTTP > Make a request
→ Router xử lý 201 / 200 / 400 / 422 / 500 / 503
```

Cấu hình module HTTP:

1. Chọn **HTTP > Make a request**.
2. Method: `POST`.
3. URL: `https://chonhaviet.com/api/public/articles`.
4. Thêm hai header ở trên.
5. Body type: `Raw` / `JSON (application/json)`.
6. Bật parse response để đọc `id`, `slug`, `duplicate` và `quality_gate`.

## 3. JSON payload cuối cùng cho Make.com

Đây là JSON Create JSON/HTTP cần gửi. Không thêm các field hệ thống ở mục 5.

```json
{
  "external_id": "make-news:{{source_system}}:{{source_article_id}}",
  "title": "{{article_title}}",
  "content": "{{clean_html_900_plus_words_with_4_h2_and_2_to_4_internal_links}}",
  "excerpt": "{{direct_answer_80_to_300_chars}}",
  "category": "{{exact_admin_category}}",
  "author": "{{verified_author_or_Ban_bien_tap}}",
  "image_url": "{{absolute_https_image_url}}",
  "meta_title": "{{meta_title_30_to_65_chars}}",
  "meta_description": "{{meta_description_120_to_160_chars}}",
  "focus_keywords": [
    "{{primary_keyword}}",
    "{{geo_keyword}}",
    "{{intent_keyword}}"
  ],
  "geo_area": "{{verified_target_area}}",
  "geo_entity": "{{verified_main_entity}}",
  "geo_notes": "{{verified_local_context_and_data_limits}}",
  "faq": [
    {
      "question": "{{source_supported_question_1}}?",
      "answer": "{{source_supported_answer_1_min_40_chars}}"
    },
    {
      "question": "{{source_supported_question_2}}?",
      "answer": "{{source_supported_answer_2_min_40_chars}}"
    },
    {
      "question": "{{source_supported_question_3}}?",
      "answer": "{{source_supported_answer_3_min_40_chars}}"
    },
    {
      "question": "{{source_supported_question_4}}?",
      "answer": "{{source_supported_answer_4_min_40_chars}}"
    }
  ],
  "citations": [
    {
      "title": "{{verified_source_1_title}}",
      "url": "{{verified_source_1_http_url}}"
    },
    {
      "title": "{{verified_source_2_title}}",
      "url": "{{verified_source_2_http_url}}"
    }
  ]
}
```

`external_id` phải được tạo từ ID bất biến của bài ở nguồn, ví dụ `make-news:notion:8f3c2a`. Khi retry phải giữ nguyên giá trị; không dùng timestamp hoặc số ngẫu nhiên mới.

## 4. Hợp đồng field và cổng chất lượng

| Field | Bắt buộc | Quy tắc |
|---|---:|---|
| `external_id` | Có | Chuỗi ổn định, tối đa 200 ký tự; dùng lại cho mọi lần retry. |
| `title` | Có | 20–180 ký tự. |
| `content` | Có | HTML sạch, tối đa 200.000 ký tự, sau sanitize còn ít nhất 900 từ. |
| `excerpt` | Có | Answer Block/tóm tắt trực tiếp, 80–300 ký tự. |
| `category` | Có | Khớp chính xác nhãn đang có trong Admin > Danh mục tin tức. |
| `author` | Có | Tên tác giả hoặc `Ban biên tập`; không để rỗng. |
| `image_url` | Có | URL tuyệt đối HTTP(S) của ảnh đại diện thật. |
| `meta_title` | Có | 30–65 ký tự. |
| `meta_description` | Có | 120–160 ký tự. |
| `focus_keywords` | Có | 3–6 cụm từ không trùng; nhận mảng chuỗi hoặc chuỗi phân cách bằng dấu phẩy. |
| `geo_area` | Có | Khu vực thật mà bài đề cập. |
| `geo_entity` | Có | Entity/chủ thể chính đã xác định. |
| `geo_notes` | Có | Ngữ cảnh địa phương, phạm vi dữ liệu và giới hạn đã kiểm chứng; tối đa 1.000 ký tự. |
| `faq` | Có | 4–6 cặp; câu hỏi kết thúc `?`; câu trả lời tối thiểu 40 ký tự. |
| `citations` | Có | 2–6 nguồn; mỗi nguồn có title và URL HTTP(S) hợp lệ. |

Nội dung HTML còn phải đạt:

- block đầu tiên là `<p>` trả lời trực tiếp, có ít nhất 50 ký tự;
- không có `<h1>` vì tiêu đề trang đã là H1;
- có ít nhất 4 H2 có chữ và không lặp tên;
- không chèn thêm H2 “Câu hỏi thường gặp” trong body; FAQ dùng field riêng;
- có ít nhất 2 internal link dạng tương đối như `/tin-tuc/...` hoặc `/khu-vuc/...`;
- mọi ảnh inline có `alt` ít nhất 8 ký tự;
- không có script/event handler; server sanitize lại trước khi chấm và lưu.

Warning không chặn lưu nháp:

- bài trên 1.800 từ;
- bài trên 1.200 từ nhưng không có danh sách/bảng phù hợp;
- hơn 4 internal links;
- nhiều citation nhưng chỉ dùng một domain.

## 5. Field hệ thống — Make.com không được gửi

Server/DB tự điền:

- `slug`;
- `related_ids` — tự chọn tối đa 5 bài public theo danh mục, keyword và độ mới;
- `schema_markup` — tự sinh NewsArticle JSON-LD từ đúng nội dung/GEO/citation;
- `created_at`, `updated_at`;
- `views = 0`;
- `is_published = false`.

Nếu gửi `schema_markup` hoặc `related_ids`, API trả `400` để tránh hiểu nhầm caller có thể điều khiển chúng. `slug`, `views` và `is_published` từ caller bị bỏ qua; bài vẫn là nháp.

## 6. Response

### `201 Created` — tạo nháp mới

```json
{
  "id": "uuid",
  "slug": "gia-nha-di-an-nam-2026",
  "is_published": false,
  "duplicate": false,
  "quality_gate": {
    "version": "article-ingest-v1",
    "passed": true,
    "score": 100,
    "issues": [],
    "warnings": [],
    "metrics": {
      "word_count": 1120,
      "h2_count": 5,
      "internal_link_count": 3,
      "faq_count": 4,
      "citation_count": 2,
      "images_without_alt": 0,
      "related_count": 5
    }
  },
  "message": "Bài viết đã lưu nháp. Vào admin để xem lại và xuất bản."
}
```

### `200 OK` — request trùng

```json
{
  "id": "uuid",
  "slug": "gia-nha-di-an-nam-2026",
  "is_published": false,
  "duplicate": true
}
```

### `422 Unprocessable Entity` — không đạt quality gate

```json
{
  "error": "ARTICLE_QUALITY_GATE_FAILED",
  "message": "Bài viết chưa đạt cổng chất lượng SEO–GEO–AIO.",
  "quality_gate": {
    "version": "article-ingest-v1",
    "passed": false,
    "score": 76,
    "issues": [
      {
        "code": "CONTENT_TOO_SHORT",
        "field": "content",
        "message": "Nội dung phải có ít nhất 900 từ; hiện có 640."
      }
    ],
    "warnings": [],
    "metrics": {
      "word_count": 640,
      "h2_count": 3,
      "internal_link_count": 1,
      "faq_count": 4,
      "citation_count": 2,
      "images_without_alt": 0
    }
  }
}
```

## 7. Router xử lý lỗi trong Make.com

| HTTP | Ý nghĩa | Xử lý |
|---:|---|---|
| `200` | `external_id` đã tồn tại. | Xem là thành công idempotent; không tạo lại. |
| `201` | Đã tạo nháp mới. | Lưu `id`, `slug`, score và warnings; báo Admin kiểm tra. |
| `400` | JSON/mapping sai, field hệ thống bị gửi hoặc category không tồn tại. | Không retry mù; sửa mapping. Đọc `allowed_categories` nếu có. |
| `401` | Thiếu/sai API key. | Kiểm tra Connection/Secret; không ghi key ra log. |
| `413` | Body vượt 512KB. | Giảm kích thước nội dung/body. |
| `422` | Không đạt checklist. | Đọc `quality_gate.issues`, đưa lại Writer sửa rồi Fact Checker kiểm tra lại. Không retry nguyên payload. |
| `409` | Không tạo được slug sau nhiều xung đột. | Báo vận hành; retry có giới hạn với cùng `external_id`. |
| `500` | Lỗi ghi DB chưa xác định. | Retry exponential backoff với cùng `external_id`. |
| `503` | Thiếu cấu hình hoặc tạm thời không đọc được DB. | Retry exponential backoff; báo vận hành nếu kéo dài. |

## 8. Prompt Writer dùng trong Make.com

```text
Bạn là biên tập viên bất động sản. Chỉ được dùng VERIFIED_SOURCE_DATA được cung cấp.
Không bịa giá, phần trăm, dự án, địa danh, pháp lý, quy hoạch, hạ tầng, dự báo hoặc nguồn.
Nếu dữ liệu không đủ, ghi rõ “Chưa đủ dữ liệu” thay vì suy diễn.

Hãy trả về đúng một JSON object theo hợp đồng API, không markdown và không giải thích.
Yêu cầu:
- title 20–180 ký tự;
- excerpt 80–300 ký tự, trả lời trực tiếp;
- content là HTML sạch 900–1.800 từ, mở đầu bằng <p> ít nhất 50 ký tự;
- không dùng H1; có ít nhất 4 H2 không trùng; dùng H3 khi cần;
- có 2–4 internal link tương đối chỉ tới URL thật được cung cấp;
- mọi ảnh inline phải có alt mô tả thật;
- meta_title 30–65 ký tự; meta_description 120–160 ký tự;
- 3–6 focus keywords không trùng;
- geo_area, geo_entity, geo_notes đều dựa trên nguồn;
- 4–6 FAQ, mỗi câu hỏi kết thúc bằng ?, mỗi trả lời ít nhất 40 ký tự và có căn cứ;
- 2–6 citations đúng title và URL của nguồn đã dùng;
- không tạo schema_markup, related_ids, slug, views, created_at, updated_at hoặc is_published.
```

## 9. Prompt Fact Checker dùng trong Make.com

```text
Bạn là bộ kiểm chứng độc lập. Đầu vào gồm VERIFIED_SOURCE_DATA và ARTICLE_DRAFT_JSON.
Đối chiếu từng claim có thể kiểm chứng trong title, excerpt, content, GEO, FAQ và metadata với nguồn.
Không chấp nhận claim chỉ vì citation tồn tại; citation phải thực sự hỗ trợ claim.
Kiểm tra URL nguồn, ngày dữ liệu, đơn vị, địa danh, pháp lý, quy hoạch và mọi con số.
Nếu dữ liệu không đủ, yêu cầu đổi claim thành “Chưa đủ dữ liệu” hoặc loại bỏ.

Trả về đúng JSON:
{
  "passed": true,
  "unsupported_claims": [],
  "source_mismatches": [],
  "required_fixes": []
}

Chỉ đặt passed=true khi không còn claim không được nguồn hỗ trợ. Make chỉ được gọi HTTP API khi passed=true.
```

## 10. Kiểm tra cuối trong Admin

Sau HTTP `201`, bài chỉ xuất hiện trong Admin ở trạng thái nháp. Người duyệt phải kiểm tra:

- tiêu đề, nội dung, ảnh và category;
- từng con số/claim so với nguồn gốc;
- link nội bộ và nguồn tham khảo có mở đúng;
- SEO title/description, GEO, FAQ, related articles và schema;
- không có dữ liệu cá nhân/bí mật ngoài phạm vi;
- chỉ bật xuất bản sau khi kiểm chứng hoàn tất.
