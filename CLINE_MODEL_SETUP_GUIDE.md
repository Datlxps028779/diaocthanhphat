# Hướng dẫn Nâng cấp Model Cline lên anthropic/claude-3.5-sonnet

## Tình trạng hiện tại
- **Model đang sử dụng:** `poolside/laguna-m.1:free` (miễn phí)
- **Provider:** OpenRouter (cần API Key)

## Các bước thực hiện

### Bước 1: Kiểm tra API Key OpenRouter
1. Mở VS Code
2. Vào **Settings** (Cmd + ,)
3. Tìm kiếm: `Cline: Api Key` hoặc `claude-dev.apiKey`
4. Nếu đã có API Key OpenRouter, hãy chắc chắn rằng tài khoản đã nạp tiền thành công

### Bước 2: Thay đổi cấu hình Model
1. Mở VS Code Settings
2. Tìm kiếm: `Cline: Model` hoặc `claude-dev.modelId`
3. Hoặc mở **Cline Settings** (icon bánh răng trong thanh Cline)
4. Trong phần **API Configuration**:
   - **API Provider:** Chọn `OpenRouter`
   - **API Key:** Nhập OpenRouter API Key của bạn (bắt đầu bằng `sk-or-...`)

### Bước 3: Chọn Model anthropic/claude-3.5-sonnet
Trong giao diện Cline, khi chọn model, bạn có các lựa chọn:

**Model Claude 3.5 Sonnet (bạn yêu cầu):**
- `anthropic/claude-3.5-sonnet` - Model tiêu chuẩn
- **Giá:** ~$3/1M tokens input, ~$15/1M tokens output

**Hoặc các model Anthropic mới nhất tương đương:**
- `anthropic/claude-sonnet-4` - Phiên bản mới nhất (2024)
- `anthropic/claude-sonnet-4.5` - Phiên bản cập nhật (2025)
- `anthropic/claude-sonnet-4.6` - Phiên bản mới nhất
- `anthropic/claude-sonnet-latest` - Luôn trỏ tới model mới nhất

### Bước 4: Xác nhận cài đặt
Sau khi thay đổi:
1. Khởi động lại VS Code
2. Mở Cline và kiểm tra model hiển thị ở góc dưới cùng
3. Chạy thử một task ngắn để kiểm tra API Key hoạt động

## Lưu ý quan trọng
- API Key OpenRouter phải được lưu trong Secret Storage của VS Code
- Tài khoản OpenRouter cần đủ số dư để sử dụng model trả phí
- Model `anthropic/claude-3.5-sonnet` có giá **$3-15/1M tokens