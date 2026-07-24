import { describe, it, expect } from 'vitest';
import {
  buildNewsImageAlt,
  buildPropertyGallery,
  buildPropertyImageAlt,
  buildSeoImageGallery,
  FALLBACK_PROPERTY_IMAGE,
  normalizeSeoImageUrl,
} from './propertyImages';

const SUPABASE_IMAGE = 'https://itgxladqskdcbwsbmuyi.supabase.co/storage/v1/object/public/admin-uploads/properties/nha-pho-dep-abc123.jpg';

describe('buildPropertyGallery', () => {
  it('giữ ảnh bìa trước và bỏ trùng khi images chứa lại ảnh bìa', () => {
    expect(buildPropertyGallery('/cover.jpg', ['/cover.jpg', '/kitchen.jpg', '/cover.jpg'])).toEqual([
      'https://chonhaviet.com/cover.jpg',
      'https://chonhaviet.com/kitchen.jpg',
    ]);
  });

  it('bỏ giá trị rỗng và URL không an toàn', () => {
    expect(buildPropertyGallery('  /cover.jpg  ', ['', 'javascript:alert(1)', null, ' /balcony.jpg '])).toEqual([
      'https://chonhaviet.com/cover.jpg',
      'https://chonhaviet.com/balcony.jpg',
    ]);
  });

  it('dùng ảnh fallback khi không có URL hợp lệ', () => {
    expect(buildPropertyGallery(null, ['', undefined])).toEqual([FALLBACK_PROPERTY_IMAGE]);
  });
});

describe('buildSeoImageGallery', () => {
  it('đổi URL Supabase Storage sang domain chính /hinh-anh', () => {
    expect(buildSeoImageGallery(SUPABASE_IMAGE, null)).toEqual([
      'https://chonhaviet.com/hinh-anh/admin-uploads/properties/nha-pho-dep-abc123.jpg',
    ]);
  });

  it('không tự thêm fallback khi includeFallback=false', () => {
    expect(buildSeoImageGallery(null, null)).toEqual([]);
  });

  it('giới hạn số ảnh theo max', () => {
    expect(buildSeoImageGallery('/a.jpg', ['/b.jpg', '/c.jpg'], { max: 2 })).toEqual([
      'https://chonhaviet.com/a.jpg',
      'https://chonhaviet.com/b.jpg',
    ]);
  });
});

describe('normalizeSeoImageUrl', () => {
  it('chỉ nhận http/https hoặc root-relative', () => {
    expect(normalizeSeoImageUrl('/photo.jpg')).toBe('https://chonhaviet.com/photo.jpg');
    expect(normalizeSeoImageUrl('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
    expect(normalizeSeoImageUrl('photo.jpg')).toBe('');
  });
});

describe('alt helpers', () => {
  it('tạo alt BĐS từ tiêu đề và địa danh thật', () => {
    expect(buildPropertyImageAlt({ title: 'Nhà phố đẹp', ward: 'Phú Hòa', district: 'Thủ Dầu Một', city: 'Bình Dương' }, 1))
      .toBe('Nhà phố đẹp tại Phú Hòa, Thủ Dầu Một, Bình Dương - ảnh 2');
  });

  it('tạo alt tin tức từ tiêu đề và ngữ cảnh có sẵn', () => {
    expect(buildNewsImageAlt({ title: 'Hạ tầng mới', category: 'Hạ tầng', geo_area: 'Bình Dương' }))
      .toBe('Ảnh minh họa bài viết: Hạ tầng mới (Hạ tầng - Bình Dương)');
  });
});
