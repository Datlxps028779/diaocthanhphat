# GA4 configuration boundary — superseded plan

> Cập nhật: 2026-09-13

Owner đã xác nhận GA4 đã được cấu hình trong Vercel. Vì vậy kế hoạch đổi sang
một GA4 ID mặc định mới không được thực thi và không phải acceptance criteria.
Không đổi GA4 property hoặc sửa site setting production ngoài yêu cầu của owner.

## Phạm vi đúng

- Ưu tiên `NEXT_PUBLIC_GA_ID` hợp lệ từ Vercel.
- Nếu không có environment ID, dùng site setting GA4 hợp lệ.
- Nếu cả hai không có, giữ fallback hiện hữu `G-SKF33YNMZZ`.
- Chỉ chọn một GA4 destination; giữ Google Ads destination riêng.
- Giữ consent gating và loại trừ `/quantrihethong`, `/noi-bo`.
- Không đưa credential/token xuống browser.

## Đã verify local

- `src/lib/googleTag.ts`, `src/lib/googleTag.test.ts` và `SiteSettingsTab` đã
  được cập nhật theo phạm vi trên.
- Full Vitest `200 files / 1.557 tests`, typecheck, production build, Chrome local
  runtime và verify receipt đều đạt.
- Production pre-deploy vẫn dùng `G-SKF33YNMZZ`; chưa có `G-XK14HMKSK9`.

## Các bước còn lại

1. Deploy source hiện tại, không đổi Vercel GA4 setting.
2. Mở production bằng Chrome thật để đối chiếu tag với
   `NEXT_PUBLIC_GA_ID` thực tế.
3. Kiểm tra consent unset/granted và loại trừ private paths.
4. Chỉ sau đó chạy GA4 Data API diagnostic/report nếu server đã có đủ:
   `GOOGLE_ANALYTICS_CLIENT_EMAIL`, `GOOGLE_ANALYTICS_PRIVATE_KEY`,
   `GOOGLE_ANALYTICS_PROPERTY_ID`.

Không tự push/commit; xin phép owner riêng. Không làm AI/RAG trong task này.
