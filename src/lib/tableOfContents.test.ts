import { describe, it, expect } from 'vitest';
import { extractHeadings, injectHeadingIds, TOC_MIN_HEADINGS } from './tableOfContents';

describe('extractHeadings — nội dung HTML', () => {
  it('lấy đúng các h2 theo thứ tự xuất hiện', () => {
    const html = '<h2>Giá đất</h2><p>abc</p><h2>Hạ tầng</h2><p>def</p><h2>Pháp lý</h2>';
    expect(extractHeadings(html).map(h => h.text)).toEqual(['Giá đất', 'Hạ tầng', 'Pháp lý']);
  });

  it('bỏ qua h3/h4 (chỉ liệt kê mục lớn)', () => {
    const html = '<h2>Mục lớn</h2><h3>Mục con</h3><h4>Mục cháu</h4><h2>Mục lớn 2</h2>';
    expect(extractHeadings(html).map(h => h.text)).toEqual(['Mục lớn', 'Mục lớn 2']);
  });

  it('bỏ thẻ HTML lồng bên trong tiêu đề', () => {
    const html = '<h2>Giá <strong>đất</strong> <em>Dĩ An</em></h2>';
    expect(extractHeadings(html)[0].text).toBe('Giá đất Dĩ An');
  });

  it('giải mã entity HTML thường gặp', () => {
    const html = '<h2>Nh&agrave; &amp; đất</h2>';
    expect(extractHeadings(html)[0].text).toBe('Nhà & đất');
  });

  it('bỏ heading rỗng hoặc chỉ có khoảng trắng', () => {
    const html = '<h2></h2><h2>   </h2><h2>&nbsp;</h2><h2>Thật</h2>';
    expect(extractHeadings(html).map(h => h.text)).toEqual(['Thật']);
  });

  it('sinh id không dấu từ tiêu đề tiếng Việt', () => {
    const html = '<h2>Giá đất Dĩ An 2026</h2>';
    expect(extractHeadings(html)[0].id).toBe('muc-gia-dat-di-an-2026');
  });

  it('heading trùng tên vẫn có id khác nhau', () => {
    // 2/23 bài thật có heading trùng tên — trùng id thì bấm mục sau nhảy về mục đầu.
    const html = '<h2>Tổng quan</h2><h2>Tổng quan</h2><h2>Tổng quan</h2>';
    const ids = extractHeadings(html).map(h => h.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('muc-tong-quan');
    expect(ids[1]).toBe('muc-tong-quan-2');
    expect(ids[2]).toBe('muc-tong-quan-3');
  });

  it('tiêu đề toàn ký tự đặc biệt vẫn có id dùng được', () => {
    const html = '<h2>!!! ???</h2>';
    const h = extractHeadings(html);
    expect(h).toHaveLength(1);
    expect(h[0].id).toMatch(/^muc-/);
    expect(h[0].id.length).toBeGreaterThan(4);
  });

  it('giữ nguyên id có sẵn trong heading nếu hợp lệ', () => {
    const html = '<h2 id="san-co">Tiêu đề</h2>';
    expect(extractHeadings(html)[0].id).toBe('san-co');
  });

  it('nhận h2 có thuộc tính khác và viết hoa', () => {
    const html = '<H2 class="x" style="text-align:center">Chữ hoa</H2>';
    expect(extractHeadings(html).map(h => h.text)).toEqual(['Chữ hoa']);
  });

  it('trả mảng rỗng khi bài không có heading', () => {
    // 1/23 bài thật không có heading nào — không được hiện khung mục lục rỗng.
    expect(extractHeadings('<p>Chỉ có đoạn văn.</p>')).toEqual([]);
  });

  it('trả mảng rỗng với đầu vào rỗng hoặc không phải chuỗi', () => {
    expect(extractHeadings('')).toEqual([]);
    expect(extractHeadings(null as unknown as string)).toEqual([]);
    expect(extractHeadings(undefined as unknown as string)).toEqual([]);
  });
});

describe('extractHeadings — nội dung markdown', () => {
  it('lấy heading cấp ## và bỏ ###', () => {
    const md = '## Mục lớn\n\nnội dung\n\n### Mục con\n\n## Mục lớn 2';
    expect(extractHeadings(md).map(h => h.text)).toEqual(['Mục lớn', 'Mục lớn 2']);
  });

  it('bỏ ký tự nhấn mạnh trong tiêu đề markdown', () => {
    const md = '## Giá **đất** Dĩ An';
    expect(extractHeadings(md)[0].text).toBe('Giá đất Dĩ An');
  });

  it('không nhầm dấu # giữa dòng thành heading', () => {
    const md = 'Đoạn có #hashtag giữa câu\n\n## Thật';
    expect(extractHeadings(md).map(h => h.text)).toEqual(['Thật']);
  });
});

describe('injectHeadingIds', () => {
  it('gắn id vào đúng h2 theo thứ tự', () => {
    const html = '<h2>Giá đất</h2><p>x</p><h2>Hạ tầng</h2>';
    const out = injectHeadingIds(html, extractHeadings(html));
    expect(out).toContain('id="muc-gia-dat"');
    expect(out).toContain('id="muc-ha-tang"');
  });

  it('giữ nguyên nội dung và thuộc tính sẵn có của heading', () => {
    const html = '<h2 class="x">Giá <strong>đất</strong></h2>';
    const out = injectHeadingIds(html, extractHeadings(html));
    expect(out).toContain('class="x"');
    expect(out).toContain('<strong>đất</strong>');
  });

  it('không đụng tới h3/h4', () => {
    const html = '<h2>Lớn</h2><h3>Con</h3>';
    const out = injectHeadingIds(html, extractHeadings(html));
    expect(out).toMatch(/<h3>Con<\/h3>/);
  });

  it('không nhân đôi id khi heading đã có sẵn id', () => {
    const html = '<h2 id="san-co">Tiêu đề</h2>';
    const out = injectHeadingIds(html, extractHeadings(html));
    expect(out.match(/id=/g)).toHaveLength(1);
  });

  it('trả nguyên bản khi không có heading nào', () => {
    const html = '<p>Không có tiêu đề.</p>';
    expect(injectHeadingIds(html, [])).toBe(html);
  });

  it('id gắn vào khớp đúng với id trong mục lục', () => {
    const html = '<h2>Tổng quan</h2><h2>Tổng quan</h2>';
    const heads = extractHeadings(html);
    const out = injectHeadingIds(html, heads);
    for (const h of heads) expect(out).toContain(`id="${h.id}"`);
  });
});

describe('TOC_MIN_HEADINGS', () => {
  it('ngưỡng tối thiểu ít nhất là 2 để bài 1 mục không hiện mục lục', () => {
    expect(TOC_MIN_HEADINGS).toBeGreaterThanOrEqual(2);
  });
});
