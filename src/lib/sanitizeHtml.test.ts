import { describe, it, expect } from 'vitest';
import { sanitizeArticleHtml } from './sanitizeHtml';

describe('sanitizeArticleHtml', () => {
  it('bỏ thẻ tiêu đề/đoạn rỗng (h2 rỗng đầu bài AI)', () => {
    const out = sanitizeArticleHtml('<h2></h2><p>Nội dung</p>');
    expect(out).toBe('<p>Nội dung</p>');
  });

  it('bỏ heading chỉ có khoảng trắng / &nbsp; / <br>', () => {
    expect(sanitizeArticleHtml('<h2>  </h2><p>a</p>')).toBe('<p>a</p>');
    expect(sanitizeArticleHtml('<p>&nbsp;</p><p>a</p>')).toBe('<p>a</p>');
    expect(sanitizeArticleHtml('<h3><br></h3><p>a</p>')).toBe('<p>a</p>');
  });

  it('giữ nguyên tiêu đề có nội dung', () => {
    const html = '<h2>Tiêu đề thật</h2><p>Đoạn văn</p>';
    expect(sanitizeArticleHtml(html)).toBe(html);
  });

  it('giữ bảng và các thẻ được whitelist', () => {
    const html = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
    expect(sanitizeArticleHtml(html)).toContain('<table>');
    expect(sanitizeArticleHtml(html)).toContain('<td>1</td>');
  });

  it('loại bỏ <script>', () => {
    expect(sanitizeArticleHtml('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>');
  });

  it('giữ style text-align hợp lệ, bỏ style khác', () => {
    const out = sanitizeArticleHtml('<p style="text-align:center;color:red">x</p>');
    expect(out).toContain('text-align:center');
    expect(out).not.toContain('color');
  });

  it('ép rel=noopener noreferrer khi target=_blank', () => {
    const out = sanitizeArticleHtml('<a href="https://x.com" target="_blank">link</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('chặn URI javascript: trên link', () => {
    const out = sanitizeArticleHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });
});
