import { describe, it, expect } from 'vitest';
import { autoLinkContent, type LinkTarget } from './autoLink';

const targets: LinkTarget[] = [
  { name: 'Phú Hồng Thịnh 8', href: '/khu-dan-cu/phu-hong-thinh-8' },
  { name: 'Thuận An', href: '/khu-vuc/thuan-an' },
];

describe('autoLinkContent', () => {
  it('chèn link cho tên khu xuất hiện trong text thường', () => {
    const out = autoLinkContent('<p>Nhà tại Phú Hồng Thịnh 8 rất đẹp.</p>', targets);
    expect(out).toContain('<a href="/khu-dan-cu/phu-hong-thinh-8"');
    expect(out).toContain('>Phú Hồng Thịnh 8</a>');
  });

  it('mỗi target chỉ link LẦN ĐẦU (không spam)', () => {
    const out = autoLinkContent('<p>Thuận An đẹp. Thuận An tiềm năng.</p>', targets);
    const count = (out.match(/href="\/khu-vuc\/thuan-an"/g) || []).length;
    expect(count).toBe(1);
  });

  it('KHÔNG chèn link vào trong <a> sẵn có (tránh link lồng)', () => {
    const html = '<p><a href="/x">Thuận An</a></p>';
    expect(autoLinkContent(html, targets)).toBe(html);
  });

  it('KHÔNG chèn link vào heading', () => {
    const html = '<h2>Phú Hồng Thịnh 8</h2><p>Giới thiệu.</p>';
    const out = autoLinkContent(html, targets);
    expect(out).toContain('<h2>Phú Hồng Thịnh 8</h2>');
    expect(out).not.toContain('<h2><a');
  });

  it('ưu tiên cụm dài trước (không bị cụm ngắn nuốt)', () => {
    const long: LinkTarget[] = [
      { name: 'Bình Chuẩn', href: '/khu-vuc/binh-chuan' },
      { name: 'Bình Chuẩn 2', href: '/khu-dan-cu/binh-chuan-2' },
    ];
    const out = autoLinkContent('<p>Khu Bình Chuẩn 2 mới.</p>', long);
    expect(out).toContain('href="/khu-dan-cu/binh-chuan-2"');
  });

  it('không đổi gì khi không có target hoặc html rỗng', () => {
    expect(autoLinkContent('', targets)).toBe('');
    expect(autoLinkContent('<p>Hello</p>', [])).toBe('<p>Hello</p>');
  });

  it('không tạo link khi tên khu không xuất hiện', () => {
    const out = autoLinkContent('<p>Nội dung không liên quan.</p>', targets);
    expect(out).not.toContain('<a ');
  });

  it('KHÔNG chèn link lồng khi tên target trùng chuỗi con của href vừa chèn', () => {
    // "An" là chuỗi con của href "/khu-vuc/thuan-an" — bản cũ sẽ chèn link lồng vào
    // giữa thẻ <a> vừa tạo. Bản mới thu thập match trên text gốc nên không xảy ra.
    const t: LinkTarget[] = [
      { name: 'Thuận An', href: '/khu-vuc/thuan-an' },
      { name: 'an', href: '/khu-vuc/an' },
    ];
    const out = autoLinkContent('<p>Nhà tại Thuận An.</p>', t);
    expect(out).not.toMatch(/<a[^>]*>[^<]*<a/); // không có <a ... <a (link lồng)
    // href hợp lệ: mỗi thẻ mở <a chỉ có đúng 1 href
    const openTags = out.match(/<a\b[^>]*>/g) || [];
    for (const tag of openTags) {
      expect((tag.match(/href=/g) || []).length).toBe(1);
    }
  });

  it('lỗi bất ngờ không làm vỡ — trả HTML gốc (an toàn render)', () => {
    // targets hợp lệ nhưng name rỗng bị lọc; truyền input lạ vẫn trả chuỗi, không ném.
    expect(() => autoLinkContent('<p>abc</p>', [{ name: '', href: '/x' }])).not.toThrow();
  });

  it('tôn trọng MAX_LINKS (tối đa 4 link/bài)', () => {
    const many: LinkTarget[] = Array.from({ length: 8 }, (_, i) => ({ name: `Khu${i}`, href: `/khu-dan-cu/khu-${i}` }));
    const body = '<p>' + many.map(m => m.name).join(' và ') + ' đều tốt.</p>';
    const out = autoLinkContent(body, many);
    expect((out.match(/<a\b/g) || []).length).toBeLessThanOrEqual(4);
  });

  it('bài viết có hạn mức riêng, không giành chỗ của khu dân cư', () => {
    // Trộn 8 khu + 8 bài trong cùng một đoạn. Nếu dùng chung quota 4 thì bài viết
    // gần như không bao giờ được link vì khu dân cư đứng trước đã ăn hết.
    const places: LinkTarget[] = Array.from({ length: 8 }, (_, i) => ({
      name: `Khu${i}`, href: `/khu-dan-cu/khu-${i}`, group: 'place' as const,
    }));
    const articles: LinkTarget[] = Array.from({ length: 8 }, (_, i) => ({
      name: `Bài viết số ${i}`, href: `/tin-tuc/bai-${i}`, group: 'article' as const,
    }));
    const body = '<p>' + [...places, ...articles].map(t => t.name).join(' và ') + '.</p>';
    const out = autoLinkContent(body, [...places, ...articles]);

    const placeLinks = (out.match(/href="\/khu-dan-cu\//g) || []).length;
    const articleLinks = (out.match(/href="\/tin-tuc\//g) || []).length;
    expect(placeLinks).toBe(4);
    expect(articleLinks).toBe(3);
  });

  it('target không ghi group thì tính vào hạn mức khu dân cư (giữ hành vi cũ)', () => {
    const many: LinkTarget[] = Array.from({ length: 8 }, (_, i) => ({ name: `Khu${i}`, href: `/khu-dan-cu/khu-${i}` }));
    const body = '<p>' + many.map(m => m.name).join(' và ') + '.</p>';
    expect((autoLinkContent(body, many).match(/<a\b/g) || []).length).toBe(4);
  });
});
