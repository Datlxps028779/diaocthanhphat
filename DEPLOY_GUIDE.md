# Hướng dẫn Deploy chonhaviet.com

## Kiến trúc hệ thống

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────┐
│  Frontend (Hosting) │────▶│  Supabase Backend (Cloud) │◀────│  Admin Panel        │
│  chonhaviet.com │     │  tcmpswlabzeqtuwdjjfe     │     │  /quantrihethong    │
│  HTML/CSS/JS tĩnh   │     │  Database + Auth + API    │     │  (trong Frontend)   │
└─────────────────────┘     └──────────────────────────┘     └─────────────────────┘
```

## Bước 1: Cấu hình Backend (Supabase) — ĐÃ XONG

Supabase project của bạn: `tcmpswlabzeqtuwdjjfe`
URL: `https://tcmpswlabzeqtuwdjjfe.supabase.co`

### 1.1. Chạy SQL fix lỗi PGRST204
1. Vào **Supabase Dashboard** → **SQL Editor**
2. Copy nội dung file `supabase/fix_focus_keywords_minimal.sql`
3. Dán vào SQL Editor → **Run**
4. Xác nhận query cuối trả về 2 rows: `focus_keywords`, `schema_markup`

### 1.2. Reload PostgREST Schema Cache (BẮT BUỘC)
1. Vào **Supabase Dashboard** → **Settings** (icon bánh răng)
2. Vào **API Settings**
3. Tìm nút **"Reload schema cache"** hoặc **"Restart PostgREST"**
4. Nhấn reload → đợi 10-30 giây

### 1.3. Kiểm tra Storage Buckets
Vào **Supabase Dashboard** → **Storage**, đảm bảo có 2 buckets:
- `admin-uploads` (cho admin upload ảnh)
- `user-uploads` (cho user upload ảnh)

Nếu chưa có, tạo mới:
1. Click **New bucket**
2. Name: `admin-uploads` → Create
3. Name: `user-uploads` → Create

### 1.4. Deploy Edge Functions (tùy chọn - cho AI features)
```bash
# Cài Supabase CLI nếu chưa có
# https://supabase.com/docs/guides/cli

# Deploy functions
supabase functions deploy ai-description --project-ref tcmpswlabzeqtuwdjjfe
supabase functions deploy ai-analytics --project-ref tcmpswlabzeqtuwdjjfe
supabase functions deploy ai-autotag --project-ref tcmpswlabzeqtuwdjjfe
supabase functions deploy sitemap --project-ref tcmpswlabzeqtuwdjjfe
supabase functions deploy crm-webhook --project-ref tcmpswlabzeqtuwdjjfe
```

Chi tiết cấu hình key AI ở **mục Cấu hình AI** bên dưới.

---

## Bước 2: Deploy Frontend lên Hosting (Hostinger/cPanel)

### 2.1. Build production (đã làm xong)
```bash
cd /Users/macbucdatle/Desktop/project
npm run build
```
→ Output: thư mục `dist/` (đã copy vào `deploy_ready/1_Frontend_Production/`)

### 2.2. Upload lên hosting
**Cách A: Qua File Manager (cPanel/Hostinger)**
1. Đăng nhập cPanel/Hostinger
2. Vào **File Manager** → `public_html` (hoặc thư mục domain `chonhaviet.com`)
3. Upload file ZIP chứa toàn bộ nội dung `deploy_ready/1_Frontend_Production/`
4. Giải nén vào `public_html`

**Cách B: Qua FTP (FileZilla)**
1. Kết nối FTP tới hosting
2. Upload toàn bộ file trong `deploy_ready/1_Frontend_Production/` vào `public_html/`

### 2.3. Cấu hình .htaccess (đã có sẵn)
File `.htaccess` đã được include trong build, đảm bảo:
- SPA routing hoạt động (React Router)
- Gzip compression bật
- Cache static assets
- Security headers

### 2.4. Cấu hình SSL/HTTPS
1. Vào cPanel → **SSL/TLS** → **Let's Encrypt**
2. Kích hoạt SSL cho `chonhaviet.com`
3. Bật **Force HTTPS Redirect**

---

## Bước 3: Kiểm tra sau deploy

### 3.1. Kiểm tra frontend
```
https://chonhaviet.com
```
- Trang chủ hiển thị đúng
- Menu điều hướng hoạt động
- Có thể xem danh sách BĐS

### 3.2. Kiểm tra Admin Panel
```
https://chonhaviet.com/quantrihethong
```
- Đăng nhập bằng tài khoản admin
- Vào **Bất động sản** → **Thêm BĐS** hoặc **Sửa**
- Nhấn **Lưu BĐS** → không còn lỗi PGRST204

### 3.3. Kiểm tra API
```bash
# Test API trực tiếp
curl "https://tcmpswlabzeqtuwdjjfe.supabase.co/rest/v1/properties?select=id,focus_keywords&limit=1" \
  -H "apikey: YOUR_ANON_KEY"
```
Nếu trả về JSON (không lỗi) → PostgREST đã nhận biết cột mới

---

## Bước 4: Tạo tài khoản Admin

### 4.1. Đăng ký tài khoản
1. Vào `https://chonhaviet.com` → **Đăng nhập** → **Đăng ký**
2. Điền email, password, tên, SĐT
3. Hoàn tất đăng ký

### 4.2. Set quyền admin
1. Vào **Supabase Dashboard** → **Table Editor** → **profiles**
2. Tìm user vừa đăng ký (theo email)
3. Đổi `role` từ `user` → `admin`
4. Save

### 4.3. Đăng nhập admin
1. Vào `https://chonhaviet.com/quantrihethong`
2. Đăng nhập bằng email/password đã đăng ký
3. Vào Admin Panel → quản lý BĐS, tin tức, dự án...

---

## Cấu hình hiện tại (đã sẵn sàng)

| Thành phần | Giá trị | Trạng thái |
|-----------|---------|-----------|
| Supabase URL | `https://tcmpswlabzeqtuwdjjfe.supabase.co` | ✅ |
| Supabase Anon Key | (embedded trong build) | ✅ |
| Database | Cột `focus_keywords` đã thêm | ✅ |
| PostgREST | Cần reload schema cache | ⚠️ |
| Frontend build | `deploy_ready/1_Frontend_Production/` | ✅ Mới |
| .htaccess | SPA routing + gzip + cache | ✅ |
| Storage buckets | `admin-uploads`, `user-uploads` | Cần kiểm tra |
| Edge Functions | AI features (tùy chọn) | Cần deploy |

---

## Troubleshooting

### Lỗi: "Could not find the 'focus_keywords' column [PGRST204]"
→ **Reload PostgREST schema cache** (Bước 1.2)

### Lỗi: "Upload ảnh thất bại"
→ Kiểm tra Storage buckets tồn tại (Bước 1.3)

### Lỗi: Trang trắng (blank page)
→ Kiểm tra `.htaccess` đã upload, kiểm tra console (F12) xem lỗi JS

### Lỗi: Không vào được /quantrihethong
→ `.htaccess` cần có SPA rewrite rule (đã có sẵn trong build)

### Lỗi: Admin không lưu được BĐS
→ Kiểm tra user đã được set `role = 'admin'` trong Supabase

---

## Cấu hình AI (Claude API qua bên thứ 3)

Toàn bộ tính năng AI đọc **cùng 2 biến môi trường**. Sau này đổi nhà cung cấp/khóa
chỉ cần thay `ANTHROPIC_API_KEY` (và `ANTHROPIC_BASE_URL` nếu đổi cổng), không cần sửa code.

| Biến | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Có | Khóa API (Anthropic thật hoặc gateway bên thứ 3) |
| `ANTHROPIC_BASE_URL` | Nếu dùng bên thứ 3 | URL gateway, vd `https://api.leeh.dev`. **Không đặt** = gọi thẳng `api.anthropic.com` |

> Code gửi khóa qua **cả** `x-api-key` lẫn `Authorization: Bearer` nên hợp cả Anthropic
> chính chủ lẫn gateway bên thứ 3 (thường đọc Bearer). Không cần chỉnh gì thêm.

Khóa đặt ở **2 nơi** vì AI chạy trên 2 môi trường khác nhau:

### A) Edge Functions (Supabase secrets) — AI Phân tích, AI mô tả, AI tự gắn tag
```bash
supabase secrets set ANTHROPIC_API_KEY=YOUR_KEY --project-ref tcmpswlabzeqtuwdjjfe
supabase secrets set ANTHROPIC_BASE_URL=https://api.leeh.dev --project-ref tcmpswlabzeqtuwdjjfe

# Sau khi set secret PHẢI deploy lại các function AI để nhận biến mới:
supabase functions deploy ai-analytics --project-ref tcmpswlabzeqtuwdjjfe
supabase functions deploy ai-description --project-ref tcmpswlabzeqtuwdjjfe
supabase functions deploy ai-autotag --project-ref tcmpswlabzeqtuwdjjfe
```

### B) Next.js server (Vercel env) — AI viết bài tin tức
Vào **Vercel → Project → Settings → Environment Variables**, thêm cho môi trường
**Production** (và Preview nếu cần), rồi **redeploy**:
```
ANTHROPIC_API_KEY   = YOUR_KEY
ANTHROPIC_BASE_URL  = https://api.leeh.dev
```
(Local dev: 2 biến này nằm trong file `.env` — không commit lên git.)

### Model mặc định (tùy chọn override)
Mỗi tính năng có model mặc định riêng, đổi qua env nếu muốn:

| Biến (nơi đặt) | Mặc định | Dùng cho |
| --- | --- | --- |
| `ARTICLE_GEN_MODEL` (Vercel) | `claude-sonnet-5` | AI viết bài |
| `AI_ANALYTICS_MODEL` (Supabase) | `claude-haiku-4-5` | AI phân tích dashboard |
| `AI_DESCRIPTION_MODEL` (Supabase) | `claude-haiku-4-5` | AI viết mô tả tin đăng |
| `AI_AUTOTAG_MODEL` (Supabase) | `claude-haiku-4-5` | AI gắn tag + meta SEO |

> Lưu ý: Model phải là model mà **gateway bên thứ 3 của bạn hỗ trợ**. Nếu gateway chỉ có
> một số model, đặt các biến trên cho khớp — nếu không API trả lỗi và tính năng rơi
> về bản rule-based (không phải AI thật).

### Kiểm tra nhanh
- **AI Phân tích** (admin → "AI Phân tích"): bấm chạy, nếu ra phân tích chi tiết theo số
  liệu thật là OK; nếu ra văn bản chung chung → key/model chưa đúng (đang chạy rule-based).
- **AI viết bài** (admin → Tin tức → nút AI): tạo bài từ 1 từ khóa; lỗi 503 "Chưa cấu hình
  ANTHROPIC_API_KEY" = chưa set biến trên Vercel.

---

## Cập nhật sau này

Khi sửa code và cần deploy lại:
```bash
# 1. Build lại
npm run build

# 2. Copy vào deploy_ready
cp -r dist/* deploy_ready/1_Frontend_Production/
cp public/.htaccess deploy_ready/1_Frontend_Production/
cp public/robots.txt deploy_ready/1_Frontend_Production/

# 3. Upload lên hosting (thư mục public_html)

# 4. Push lên GitHub
git add -A
git commit -m "update: mô tả thay đổi"
git push origin main