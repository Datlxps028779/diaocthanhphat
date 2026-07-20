import { describe, expect, it } from 'vitest';
import { countImagesWithoutAlt, countInternalLinks, evaluateNewsReadiness, plainTextFromContent } from './contentReadiness';

const completeNews = {
  title: 'Hạ tầng Dĩ An tạo lực đẩy cho bất động sản Bình Dương',
  slug: 'ha-tang-di-an-tao-luc-day-bat-dong-san-binh-duong',
  excerpt: 'Hạ tầng giao thông tại Dĩ An đang cải thiện mạnh, tạo thêm lợi thế kết nối cho thị trường bất động sản Bình Dương.',
  content: `<p>${Array.from({ length: 310 }, (_, i) => `từ${i}`).join(' ')}</p><p><a href="/tin-tuc/bai-lien-quan">Bài liên quan</a></p><img src="/news/a.jpg" alt="Hạ tầng Dĩ An Bình Dương kết nối khu dân cư" />`,
  imageUrl: '/news/cover.jpg',
  metaTitle: 'Hạ tầng Dĩ An và bất động sản Bình Dương',
  metaDescription: 'Phân tích tác động của hạ tầng Dĩ An tới thị trường bất động sản Bình Dương, khả năng kết nối, pháp lý và nhu cầu đầu tư thực tế.',
  focusKeywords: 'hạ tầng Dĩ An, bất động sản Bình Dương, nhà đất Dĩ An',
  geoArea: 'Dĩ An, Bình Dương',
  geoEntity: 'hạ tầng giao thông Dĩ An',
  relatedCount: 2,
};

describe('contentReadiness', () => {
  it('strips html content into readable plain text', () => {
    expect(plainTextFromContent('<p>Nhà phố <strong>Dĩ An</strong></p>')).toBe('Nhà phố Dĩ An');
  });

  it('counts internal links only', () => {
    expect(countInternalLinks('<a href="/tin-tuc/a">A</a><a href="https://example.com">B</a>')).toBe(1);
  });

  it('detects images without useful alt text', () => {
    expect(countImagesWithoutAlt('<img src="a.jpg"><img src="b.jpg" alt="ngắn"><img src="c.jpg" alt="Ảnh dự án Bình Dương thực tế">')).toBe(2);
  });

  it('marks complete news as publish-ready', () => {
    const result = evaluateNewsReadiness(completeNews);
    expect(result.canPublish).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.errors).toHaveLength(0);
  });

  it('blocks public news when required SEO/GEO fields are missing', () => {
    const result = evaluateNewsReadiness({
      ...completeNews,
      title: '',
      excerpt: '',
      content: '<p>mỏng</p><img src="/x.jpg">',
      imageUrl: '',
      metaTitle: '',
      metaDescription: '',
      focusKeywords: '',
      geoArea: '',
      geoEntity: '',
      schemaError: 'Schema JSON không hợp lệ.',
    });
    expect(result.canPublish).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.errors.map(e => e.key)).toEqual(expect.arrayContaining(['title', 'excerpt', 'content', 'image', 'image-alt', 'meta-title', 'meta-description', 'keywords', 'geo', 'schema']));
  });
});
