import { describe, it, expect } from 'vitest';
import { resolveImageRequest, IMAGE_BUCKETS, PRIVATE_FOLDERS } from './imageProxy';

describe('resolveImageRequest — quyết định đường dẫn ảnh nào được phục vụ', () => {
  it('cho phép ảnh tin đăng', () => {
    expect(resolveImageRequest(['admin-uploads', 'properties', 'a.jpg']))
      .toEqual({ bucket: 'admin-uploads', path: 'properties/a.jpg' });
  });

  // Thư mục do admin tự đặt nhãn lúc upload (lai-thieu-01, phu-hong-thinh-8...) nên
  // KHÔNG thể allowlist tĩnh — chặn theo thư mục mật + đuôi file thay vì liệt kê.
  it('cho phép thư mục nhãn động admin tự tạo', () => {
    expect(resolveImageRequest(['admin-uploads', 'lai-thieu-01', 'x.jpg'])?.path).toBe('lai-thieu-01/x.jpg');
    expect(resolveImageRequest(['admin-uploads', 'phu-hong-thinh-8', 'x.jpg'])?.path).toBe('phu-hong-thinh-8/x.jpg');
  });

  it('cho phép các thư mục ảnh đang dùng thật', () => {
    for (const folder of ['news', 'neighborhoods', 'user-listings']) {
      expect(resolveImageRequest(['admin-uploads', folder, 'x.jpg'])?.path).toBe(`${folder}/x.jpg`);
    }
  });

  it('giữ nguyên đường dẫn nhiều cấp', () => {
    expect(resolveImageRequest(['admin-uploads', 'properties', '2026', 'a.jpg'])?.path)
      .toBe('properties/2026/a.jpg');
  });

  it('CHẶN thư mục tài liệu nội bộ ai-docs', () => {
    expect(resolveImageRequest(['admin-uploads', 'ai-docs', 'hop-dong.pdf'])).toBeNull();
    expect(resolveImageRequest(['admin-uploads', 'ai-docs', 'anh-trong-tai-lieu.jpg'])).toBeNull();
    expect(resolveImageRequest(['admin-uploads', 'ai-docs', 'sub', 'x.jpg'])).toBeNull();
  });

  it('chặn ai-docs kể cả khi đổi hoa thường hoặc encode để né lọc', () => {
    expect(resolveImageRequest(['admin-uploads', 'AI-Docs', 'x.jpg'])).toBeNull();
    expect(resolveImageRequest(['admin-uploads', 'ai%2Ddocs', 'x.jpg'])).toBeNull();
  });

  it('chặn bucket không nằm trong danh sách', () => {
    expect(resolveImageRequest(['bucket-la', 'properties', 'a.jpg'])).toBeNull();
  });

  it('chặn path traversal và segment rỗng', () => {
    expect(resolveImageRequest(['admin-uploads', 'properties', '..', 'ai-docs', 'x.jpg'])).toBeNull();
    expect(resolveImageRequest(['admin-uploads', '..', 'ai-docs', 'x.jpg'])).toBeNull();
    expect(resolveImageRequest(['admin-uploads', 'properties', ''])).toBeNull();
  });

  it('chặn khi thiếu segment', () => {
    expect(resolveImageRequest([])).toBeNull();
    expect(resolveImageRequest(['admin-uploads'])).toBeNull();
    expect(resolveImageRequest(['admin-uploads', 'properties'])).toBeNull();
  });

  // Tài liệu (.pdf/.docx/.xlsx) không bao giờ đi qua đường ảnh, kể cả thư mục hợp lệ.
  it('chỉ phục vụ đuôi file ảnh', () => {
    expect(resolveImageRequest(['admin-uploads', 'properties', 'a.pdf'])).toBeNull();
    expect(resolveImageRequest(['admin-uploads', 'properties', 'a.docx'])).toBeNull();
    expect(resolveImageRequest(['admin-uploads', 'properties', 'a'])).toBeNull();
    expect(resolveImageRequest(['admin-uploads', 'properties', 'a.webp'])?.path).toBe('properties/a.webp');
    expect(resolveImageRequest(['admin-uploads', 'properties', 'A.JPG'])?.path).toBe('properties/A.JPG');
  });

  it('giải mã segment đã encode (tên file có khoảng trắng)', () => {
    expect(resolveImageRequest(['admin-uploads', 'properties', 'nha%20pho.jpg'])?.path)
      .toBe('properties/nha pho.jpg');
  });

  it('cấu hình khớp bucket thật đang dùng', () => {
    expect(IMAGE_BUCKETS).toContain('admin-uploads');
    expect(IMAGE_BUCKETS).toContain('public-media');
    expect(PRIVATE_FOLDERS).toContain('ai-docs');
  });
});
