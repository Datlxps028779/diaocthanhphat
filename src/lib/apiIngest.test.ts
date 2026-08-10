import { describe, it, expect } from 'vitest';
import { normalizeListingPayload, normalizeArticlePayload } from './apiIngest';

describe('normalizeListingPayload', () => {
  const valid = { title: 'Nhà 2 tầng Dĩ An', price: 3.5, city: 'Bình Dương' };

  it('nhận payload tối thiểu hợp lệ', () => {
    const r = normalizeListingPayload(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.title).toBe('Nhà 2 tầng Dĩ An');
    expect(r.row.price).toBe(3.5);
    expect(r.row.city).toBe('Bình Dương');
  });

  it('luôn ép status=pending, bỏ qua status trong body', () => {
    const r = normalizeListingPayload({ ...valid, status: 'approved' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.status).toBe('pending');
  });

  it('không cho body tự đặt property_id / expires_at / user_id', () => {
    const r = normalizeListingPayload({
      ...valid,
      property_id: '00000000-0000-0000-0000-000000000001',
      expires_at: '2099-01-01T00:00:00Z',
      user_id: '00000000-0000-0000-0000-000000000002',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).not.toHaveProperty('property_id');
    expect(r.row).not.toHaveProperty('expires_at');
    expect(r.row).not.toHaveProperty('user_id');
  });

  it('báo lỗi khi thiếu field bắt buộc', () => {
    const r = normalizeListingPayload({ description: 'chỉ có mô tả' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/title/);
    expect(r.errors.join(' ')).toMatch(/price/);
    expect(r.errors.join(' ')).toMatch(/city/);
  });

  it('từ chối body không phải object', () => {
    for (const bad of [null, undefined, 'chuỗi', 42, []]) {
      expect(normalizeListingPayload(bad).ok).toBe(false);
    }
  });

  it('ép price dạng chuỗi thành số', () => {
    const r = normalizeListingPayload({ ...valid, price: '3.5' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.price).toBe(3.5);
  });

  it('từ chối price không phải số hoặc <= 0', () => {
    for (const bad of ['ba tỷ', 0, -5, NaN]) {
      const r = normalizeListingPayload({ ...valid, price: bad });
      expect(r.ok, `price=${String(bad)}`).toBe(false);
    }
  });

  it('mặc định listing_type=mua_ban và price_unit=tỷ', () => {
    const r = normalizeListingPayload(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.listing_type).toBe('mua_ban');
    expect(r.row.price_unit).toBe('tỷ');
  });

  it('giữ listing_type hợp lệ, thay giá trị lạ bằng mua_ban', () => {
    for (const t of ['mua_ban', 'cho_thue', 'can_mua', 'can_thue']) {
      const r = normalizeListingPayload({ ...valid, listing_type: t });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.row.listing_type).toBe(t);
    }
    const bad = normalizeListingPayload({ ...valid, listing_type: 'DROP TABLE' });
    expect(bad.ok).toBe(true);
    if (!bad.ok) return;
    expect(bad.row.listing_type).toBe('mua_ban');
  });

  it('chỉ nhận ảnh URL http(s), loại javascript: và data:', () => {
    const r = normalizeListingPayload({
      ...valid,
      images: [
        'https://a.com/1.jpg',
        'http://b.com/2.jpg',
        'javascript:alert(1)',
        'data:text/html,<script>',
        '/relative.jpg',
        '',
        null,
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.images).toEqual(['https://a.com/1.jpg', 'http://b.com/2.jpg']);
  });

  it('chặn quá 30 ảnh', () => {
    const many = Array.from({ length: 40 }, (_, i) => `https://a.com/${i}.jpg`);
    const r = normalizeListingPayload({ ...valid, images: many });
    expect(r.ok).toBe(false);
  });

  it('image_url lấy ảnh đầu khi không truyền riêng', () => {
    const r = normalizeListingPayload({ ...valid, images: ['https://a.com/1.jpg'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.image_url).toBe('https://a.com/1.jpg');
  });

  it('ép bedrooms/bathrooms về số nguyên, bỏ giá trị rác', () => {
    const r = normalizeListingPayload({ ...valid, bedrooms: '3', bathrooms: 'hai' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.bedrooms).toBe(3);
    expect(r.row.bathrooms).toBeNull();
  });

  it('cắt tiêu đề quá dài', () => {
    const r = normalizeListingPayload({ ...valid, title: 'x'.repeat(500) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.title.length).toBeLessThanOrEqual(300);
  });

  it('giữ external_id dạng chuỗi để chống trùng', () => {
    const r = normalizeListingPayload({ ...valid, external_id: 'make-001' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.external_id).toBe('make-001');
  });

  it('external_id rỗng hoặc sai kiểu thành null', () => {
    for (const bad of ['', '   ', 42, {}]) {
      const r = normalizeListingPayload({ ...valid, external_id: bad });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.row.external_id).toBeNull();
    }
  });
});

describe('normalizeArticlePayload', () => {
  const valid = { title: 'Giá đất Dĩ An 2026', content: '<p>Nội dung bài</p>' };

  it('nhận payload tối thiểu hợp lệ', () => {
    const r = normalizeArticlePayload(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.title).toBe('Giá đất Dĩ An 2026');
    expect(r.row.content).toBe('<p>Nội dung bài</p>');
  });

  it('luôn ép is_published=false, bỏ qua cờ trong body', () => {
    const r = normalizeArticlePayload({ ...valid, is_published: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.is_published).toBe(false);
  });

  it('báo lỗi khi thiếu title hoặc content', () => {
    expect(normalizeArticlePayload({ title: 'chỉ có tiêu đề' }).ok).toBe(false);
    expect(normalizeArticlePayload({ content: 'chỉ có nội dung' }).ok).toBe(false);
  });

  it('từ chối body không phải object', () => {
    for (const bad of [null, undefined, 'chuỗi', 42, []]) {
      expect(normalizeArticlePayload(bad).ok).toBe(false);
    }
  });

  it('mặc định category và author', () => {
    const r = normalizeArticlePayload(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.category).toBe('Thị trường');
    expect(r.row.author).toBe('Ban biên tập');
  });

  it('không cho body tự đặt slug hay views', () => {
    const r = normalizeArticlePayload({ ...valid, slug: 'tu-dat-slug', views: 9999 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).not.toHaveProperty('slug');
    expect(r.row).not.toHaveProperty('views');
  });

  it('chỉ nhận image_url http(s)', () => {
    const ok = normalizeArticlePayload({ ...valid, image_url: 'https://a.com/x.jpg' });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.row.image_url).toBe('https://a.com/x.jpg');

    const bad = normalizeArticlePayload({ ...valid, image_url: 'javascript:alert(1)' });
    expect(bad.ok).toBe(true);
    if (!bad.ok) return;
    expect(bad.row.image_url).toBeNull();
  });

  it('giữ external_id để chống trùng', () => {
    const r = normalizeArticlePayload({ ...valid, external_id: 'make-news-9' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.external_id).toBe('make-news-9');
  });
});
