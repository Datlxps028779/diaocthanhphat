import { describe, expect, it } from 'vitest';
import { nextSafeImageSource, normalizeSafeImageSource } from './SafeImage';

describe('SafeImage source helpers', () => {
  it('chuẩn hóa URL rỗng và khoảng trắng', () => {
    expect(normalizeSafeImageSource('  /anh/nha.jpg  ')).toBe('/anh/nha.jpg');
    expect(normalizeSafeImageSource('   ')).toBe('');
    expect(normalizeSafeImageSource(null)).toBe('');
    expect(normalizeSafeImageSource('javascript:alert(1)')).toBe('');
    expect(normalizeSafeImageSource('anh-khong-co-scheme.jpg')).toBe('');
  });

  it('đưa URL Supabase public legacy về proxy ảnh của website', () => {
    expect(normalizeSafeImageSource('https://demo.supabase.co/storage/v1/object/public/public-media/properties/nha.jpg'))
      .toBe('https://chonhaviet.com/hinh-anh/public-media/properties/nha.jpg');
  });

  it('chỉ chuyển sang fallback một lần', () => {
    expect(nextSafeImageSource('/anh-loi.jpg', '/anh-mac-dinh.jpg')).toBe('/anh-mac-dinh.jpg');
    expect(nextSafeImageSource('/anh-mac-dinh.jpg', '/anh-mac-dinh.jpg')).toBe('');
    expect(nextSafeImageSource('/anh-loi.jpg', '   ')).toBe('');
  });
});
