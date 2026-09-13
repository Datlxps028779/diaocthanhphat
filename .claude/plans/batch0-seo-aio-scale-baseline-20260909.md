# Batch 0 — Baseline SEO/GEO/AIO và control contract

Đo read-only ngày 2026-09-09. Không sửa dữ liệu production, không gửi lại sitemap và không gọi URL Inspection.

## 1. Trạng thái deploy và public regression

- Git local và `origin/main`: `2de3acb` (`fix(seo): add valuation main landmark`).
- GitHub Deployments API chưa đọc được vì CLI hiện không có phiên `gh auth`; do đó chưa thể dùng deployment record để chứng minh SHA production tuyệt đối.
- Runtime production đã có dấu vân tay hành vi của batch semantic:
  - `/`, `/mua-ban`, `/tin-tuc`, `/du-lieu-gia`, một listing detail và một news detail đều HTTP 200;
  - desktop 1440px và mobile 390px đều có đúng một `<main>`;
  - H1 đều nằm trong `<main>`;
  - JSON-LD parse thành công;
  - canonical, page-level schema URL và `mainEntityOfPage` dùng URL tuyệt đối `https://chonhaviet.com/...`;
  - FAQ schema của homepage/listing/news có nội dung hỏi–đáp tồn tại trong DOM public;
  - sitemap và robots không regress.

Giới hạn đã phân loại:

- News/listing detail phát sinh HTTP 401 ở RPC `increment_news_views`; đây là luồng đếm view hiện hữu, không làm hỏng HTML/canonical/schema, nhưng cần xử lý ở batch vận hành riêng.
- Global `RealEstateAgent` đang lấy mô tả cấu hình production có một số claim marketing mạnh (`uy tín`, `báo giá chính xác`, `hỗ trợ pháp lý an toàn`). Đây không phải regression của commit semantic, nhưng cần đưa vào factual-claim worklist Gate 4 thay vì mặc nhiên coi là verified fact.

## 2. Inventory production read-only

| Nguồn | Tổng | Public/eligible | Ghi chú |
|---|---:|---:|---|
| `properties` | 54 | 52 active | REST read-only bằng service role server-local |
| `user_listings` | 31 | 31 approved | Không mutate |
| `news` | 79 | 79 published | Hiện không có draft |
| `search_visibility_urls` | 187 | 169 eligible | 18 excluded |
| Google evidence | 169 | 169 observed | Không đổi verdict, không suy diễn `NEUTRAL` thành indexed |
| `search_visibility_runs` | 103 | — | Không tạo run mới |
| `seo_freshness_jobs` | 63 | 63 succeeded | pending/processing/failed/dead_letter = 0 |

## 3. Sitemap/robots baseline

- `/sitemap.xml`: 171 URL, 171 unique.
- Không có query/hash.
- Không có origin ngoài `https://chonhaviet.com/`.
- `/robots.txt` trỏ cả:
  - `https://chonhaviet.com/sitemap.xml`;
  - `https://chonhaviet.com/sitemap-images.xml`.
- Chưa chuyển sang sitemap index/shard; hard-cap hiện tại vẫn là rủi ro scale cần Batch C xử lý.

## 4. Performance baseline bằng Google Chrome thật

Các số dưới đây là một lượt đo kỹ thuật, không được diễn giải thành p75 production telemetry.

| Route | Viewport | TTFB | Load | Transfer | Ảnh |
|---|---|---:|---:|---:|---:|
| `/` | 1440 | 693 ms | 1.759 s | 12.16 MB | 11.71 MB |
| `/` | 390 | 1.348 s | 2.012 s | 2.65 MB | 2.21 MB |
| `/mua-ban` | 1440 | 270 ms | 626 ms | 8.60 MB | 8.52 MB |
| `/mua-ban` | 390 | 94 ms | 637 ms | 3.44 MB | 3.37 MB |
| `/tin-tuc` | 1440 | 95 ms | 609 ms | 5.28 MB | 5.15 MB |
| `/tin-tuc` | 390 | 94 ms | 763 ms | 4.19 MB | 4.08 MB |
| listing detail mẫu | 390 | 93 ms | 723 ms | 0.91 MB | 0.87 MB |
| news detail mẫu | 390 | 93 ms | 545 ms | 0.22 MB | 0.21 MB |

Kết luận baseline:

- HTML/server response ở phần lớn route đang nhanh.
- Homepage cold sample và tổng image transfer của homepage/list/news là gap lớn nhất.
- LCP chưa thu được từ lượt script này, vì vậy chưa được đánh PASS performance budget; Batch B phải đo bằng observer/Lighthouse/telemetry đúng chuẩn trước–sau.

## 5. Publish-path baseline

### External ingress

`POST /api/public/articles` hiện:

- có ingest auth;
- normalize/sanitize payload;
- chạy full quality gate SEO–GEO–AIO;
- ép `is_published=false`;
- idempotent theo `external_id`;
- chỉ lưu draft.

### Admin

Admin hiện vẫn ghi trực tiếp bảng `news` qua browser Supabase client:

- create/update/delete trực tiếp;
- single publish/unpublish trực tiếp bằng `is_published`;
- bulk publish/unpublish trực tiếp;
- quality/readiness chủ yếu được kiểm tra ở frontend;
- DB trigger production mới bắt buộc citation floor, chưa phải full shared quality gate.

Đây là mismatch load-bearing cần đóng ở Batch A.

## 6. Control contract đã chốt

### Publication quality state

```text
pass | warning | blocked
```

Báo cáo phải gắn với đúng content version và gồm:

- `quality_version`;
- `content_version`;
- `canonical_url`;
- `score`;
- `issues[]` và `warnings[]` có code/field/message;
- word/H2/internal-link/FAQ/citation/image-alt metrics;
- actor và thời điểm evaluation.

### Publication transition

```text
draft --publish--> public
public --unpublish--> draft
public --update--> public phiên bản mới
```

Yêu cầu:

- optimistic version check;
- owner-MFA/server authorization;
- publish fail thì không đổi public state và không sinh freshness/outbox giả;
- retry cùng version/state phải idempotent;
- event gồm `event_id`, actor, action, old/new state, content version và affected paths;
- canonical/slug/schema không nhận tùy ý từ browser trong thao tác publish.

### Rollout flags

```text
NEWS_PUBLISH_BOUNDARY_MODE=observe|enforce
SITEMAP_MANIFEST_MODE=live|shadow
FRESHNESS_COALESCE_MODE=off|shadow|on
```

- `observe`: chạy và lưu/hiển thị quality report nhưng chưa khóa toàn bộ legacy path.
- `enforce`: public transition chỉ thành công qua server boundary/RPC.
- Mặc định rollout phải fail-safe và không bật `enforce` trước khi migration + runtime verify thành công.

## 7. Gate Batch 0

- Baseline production đã lưu: PASS.
- Rollback/rollout contract: PASS.
- Exact Vercel deployment SHA evidence: BLOCKED bởi thiếu GitHub/Vercel authenticated deployment API; runtime fingerprint PASS nhưng không thay thế deployment record.
- Staging fixtures 1k/5k/10k/60k: chuyển sang Batch C/F vì hiện chưa có staging database riêng trong phiên này; không sinh dữ liệu vào production.

Bước triển khai tiếp theo: **Batch A1 — đưa mọi transition publish/unpublish của News qua server boundary, thêm quality report theo version, migration RPC/audit-outbox và khóa legacy direct publication path sau khi user tự chạy SQL.**
