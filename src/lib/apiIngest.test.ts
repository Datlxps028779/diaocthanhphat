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

  it('chuẩn hóa CAPS LOCK nhưng giữ acronym và địa danh listing', () => {
    const r = normalizeListingPayload({
      ...valid,
      title: '  BÁN   ĐẤT KCN DĨ AN SỔ HONG  ',
      district: 'Dĩ An',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.title).toBe('Bán đất KCN Dĩ An sổ hồng');
  });

  it('giữ cặp tọa độ hợp lệ và chặn tọa độ thiếu hoặc ngoài phạm vi', () => {
    const validCoordinates = normalizeListingPayload({ ...valid, latitude: '10.9804', longitude: '106.6519' });
    expect(validCoordinates.ok).toBe(true);
    if (!validCoordinates.ok) return;
    expect(validCoordinates.row.latitude).toBe(10.9804);
    expect(validCoordinates.row.longitude).toBe(106.6519);

    for (const coordinates of [{ latitude: '10.9' }, { longitude: '106.6' }, { latitude: '91', longitude: '106.6' }, { latitude: '10abc', longitude: '106.6' }]) {
      expect(normalizeListingPayload({ ...valid, ...coordinates }).ok).toBe(false);
    }
    const empty = normalizeListingPayload(valid);
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(empty.row.latitude).toBeNull();
    expect(empty.row.longitude).toBeNull();
  });

  it('nhận giá thuê từ price_per_month và giữ giá tương thích bằng 0', () => {
    const r = normalizeListingPayload({ ...valid, listing_type: 'cho_thue', price: 0, price_per_month: '8' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.price).toBe(0);
    expect(r.row.price_per_month).toBe(8);
    expect(r.row.price_unit).toBe('triệu/tháng');
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

  it('chặn phòng không phải số nguyên không âm', () => {
    const validRooms = normalizeListingPayload({ ...valid, bedrooms: '3', bathrooms: '2' });
    expect(validRooms.ok).toBe(true);
    if (!validRooms.ok) return;
    expect(validRooms.row.bedrooms).toBe(3);
    expect(validRooms.row.bathrooms).toBe(2);

    for (const value of ['-1', '2.5', 'hai']) {
      expect(normalizeListingPayload({ ...valid, bedrooms: value }).ok).toBe(false);
      expect(normalizeListingPayload({ ...valid, bathrooms: value }).ok).toBe(false);
    }
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
  const valid = {
    external_id: 'make-news-9',
    title: 'Giá đất Dĩ An 2026',
    content: '<p>Nội dung bài</p>',
    excerpt: 'Tóm tắt bài viết',
    category: 'Thị trường',
    author: 'Ban biên tập',
    image_url: 'https://a.com/x.jpg',
    meta_title: 'Giá đất Dĩ An 2026',
    meta_description: 'Mô tả bài viết',
    focus_keywords: ['giá đất Dĩ An', 'BẤT ĐỘNG SẢN', 'giá đất Dĩ An'],
    geo_area: 'Dĩ An, Bình Dương',
    geo_entity: 'thị trường đất ở Dĩ An',
    geo_notes: 'Dữ liệu có ngày cập nhật và phạm vi mẫu rõ ràng.',
    faq: [
      { question: 'Giá này có phải giá giao dịch?', answer: 'Không, đây là dữ liệu tham khảo có nêu rõ phạm vi.' },
    ],
    citations: [
      { title: 'Nguồn dữ liệu', url: 'https://example.com/source' },
    ],
  };

  it('nhận và chuẩn hóa đầy đủ field biên tập do Make cung cấp', () => {
    const r = normalizeArticlePayload(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({
      title: 'Giá đất Dĩ An 2026',
      content: '<p>Nội dung bài</p>',
      category: 'Thị trường',
      author: 'Ban biên tập',
      external_id: 'make-news-9',
      geo_area: 'Dĩ An, Bình Dương',
      geo_entity: 'thị trường đất ở Dĩ An',
      geo_notes: 'Dữ liệu có ngày cập nhật và phạm vi mẫu rõ ràng.',
      faq: valid.faq,
      citations: valid.citations,
      focus_keywords: 'giá đất Dĩ An, BẤT ĐỘNG SẢN',
      is_published: false,
    });
  });

  it('bắt buộc title, content, external_id, category và author', () => {
    const r = normalizeArticlePayload({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const errors = r.errors.join(' ');
    expect(errors).toMatch(/title/);
    expect(errors).toMatch(/content/);
    expect(errors).toMatch(/external_id/);
    expect(errors).toMatch(/category/);
    expect(errors).toMatch(/author/);
  });

  it('từ chối body không phải object', () => {
    for (const bad of [null, undefined, 'chuỗi', 42, []]) {
      expect(normalizeArticlePayload(bad).ok).toBe(false);
    }
  });

  it('luôn ép nháp và bỏ qua slug/views do caller gửi', () => {
    const r = normalizeArticlePayload({
      ...valid,
      is_published: true,
      slug: 'tu-dat-slug',
      views: 9999,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.is_published).toBe(false);
    expect(r.row).not.toHaveProperty('slug');
    expect(r.row).not.toHaveProperty('views');
  });

  it('từ chối schema và related IDs do caller tự đặt', () => {
    for (const field of ['schema_markup', 'related_ids'] as const) {
      const r = normalizeArticlePayload({ ...valid, [field]: field === 'related_ids' ? [] : {} });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors.join(' ')).toContain(field);
    }
  });

  it('sanitize script, event handler và H1 trước khi trả row', () => {
    const r = normalizeArticlePayload({
      ...valid,
      content: '<h1>Không hợp lệ</h1><p onclick="alert(1)">Nội dung</p><script>alert(1)</script>',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.content).not.toMatch(/<h1|onclick|<script/i);
    expect(r.row.content).toContain('<p>Nội dung</p>');
  });

  it('chỉ nhận image_url http(s)', () => {
    const bad = normalizeArticlePayload({ ...valid, image_url: 'javascript:alert(1)' });
    expect(bad.ok).toBe(true);
    if (!bad.ok) return;
    expect(bad.row.image_url).toBeNull();
  });

  it('từ chối FAQ và citation sai shape hoặc URL', () => {
    const badFaq = normalizeArticlePayload({ ...valid, faq: [{ question: 'Thiếu answer' }] });
    expect(badFaq.ok).toBe(false);

    const badCitation = normalizeArticlePayload({
      ...valid,
      citations: [{ title: 'Nguồn xấu', url: 'javascript:alert(1)' }],
    });
    expect(badCitation.ok).toBe(false);
  });

  it('từ chối quá 6 FAQ hoặc citation', () => {
    const faq = Array.from({ length: 7 }, (_, index) => ({
      question: `Câu hỏi ${index}?`,
      answer: `Câu trả lời ${index}`,
    }));
    const citations = Array.from({ length: 7 }, (_, index) => ({
      title: `Nguồn ${index}`,
      url: `https://example.com/${index}`,
    }));

    expect(normalizeArticlePayload({ ...valid, faq }).ok).toBe(false);
    expect(normalizeArticlePayload({ ...valid, citations }).ok).toBe(false);
  });

  it('từ chối field quá giới hạn thay vì âm thầm cắt mất dữ liệu', () => {
    const longContent = normalizeArticlePayload({ ...valid, content: 'x'.repeat(200_001) });
    expect(longContent.ok).toBe(false);
    if (!longContent.ok) {
      expect(longContent.errors).toHaveLength(1);
      expect(longContent.errors.join(' ')).toMatch(/content.*200000/);
    }

    const longExternalId = normalizeArticlePayload({ ...valid, external_id: 'x'.repeat(201) });
    expect(longExternalId.ok).toBe(false);
    if (!longExternalId.ok) expect(longExternalId.errors.join(' ')).toMatch(/external_id.*200/);

    const longGeoNotes = normalizeArticlePayload({ ...valid, geo_notes: 'x'.repeat(1001) });
    expect(longGeoNotes.ok).toBe(false);
    if (!longGeoNotes.ok) expect(longGeoNotes.errors.join(' ')).toMatch(/geo_notes.*1000/);
  });
});
