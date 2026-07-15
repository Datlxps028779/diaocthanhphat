import { describe, it, expect } from 'vitest';
import { buildPropertyGallery, FALLBACK_PROPERTY_IMAGE } from './propertyImages';

describe('buildPropertyGallery', () => {
  it('giữ ảnh bìa trước và bỏ trùng khi images chứa lại ảnh bìa', () => {
    expect(buildPropertyGallery('cover.jpg', ['cover.jpg', 'kitchen.jpg', 'cover.jpg'])).toEqual([
      'cover.jpg',
      'kitchen.jpg',
    ]);
  });

  it('bỏ giá trị rỗng và trim URL', () => {
    expect(buildPropertyGallery('  cover.jpg  ', ['', '  ', null, ' balcony.jpg '])).toEqual([
      'cover.jpg',
      'balcony.jpg',
    ]);
  });

  it('dùng ảnh fallback khi không có URL hợp lệ', () => {
    expect(buildPropertyGallery(null, ['', undefined])).toEqual([FALLBACK_PROPERTY_IMAGE]);
  });
});
