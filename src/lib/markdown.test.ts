import { describe, it, expect } from 'vitest';
import { isHtmlContent, stripHtml, markdownToHtml } from './markdown';

describe('isHtmlContent', () => {
  it('trả false cho chuỗi markdown thuần', () => {
    expect(isHtmlContent('## Tiêu đề\n**đậm** và *nghiêng*')).toBe(false);
    expect(isHtmlContent('- Ý 1\n- Ý 2')).toBe(false);
    expect(isHtmlContent('')).toBe(false);
  });

  it('trả true khi có thẻ block HTML', () => {
    expect(isHtmlContent('<p>xin chào</p>')).toBe(true);
    expect(isHtmlContent('<h2>Tiêu đề</h2>')).toBe(true);
    expect(isHtmlContent('<ul><li>a</li></ul>')).toBe(true);
    expect(isHtmlContent('<img src="/a.jpg" />')).toBe(true);
  });
});

describe('stripHtml', () => {
  it('bỏ thẻ, decode entity và gộp whitespace', () => {
    expect(stripHtml('<p>Xin  chào</p>')).toBe('Xin chào');
    expect(stripHtml('<strong>A</strong> &amp; <em>B</em>')).toBe('A & B');
    expect(stripHtml('a&nbsp;b&#39;c')).toBe("a b'c");
  });
});

describe('markdownToHtml', () => {
  it('chuyển heading, đậm, nghiêng', () => {
    expect(markdownToHtml('## Tiêu đề phụ')).toBe('<h2>Tiêu đề phụ</h2>');
    expect(markdownToHtml('### Nhỏ hơn')).toBe('<h3>Nhỏ hơn</h3>');
    expect(markdownToHtml('**đậm** và *nghiêng*')).toBe('<p><strong>đậm</strong> và <em>nghiêng</em></p>');
  });

  it('chuyển danh sách và trích dẫn', () => {
    expect(markdownToHtml('- Ý 1\n- Ý 2')).toBe('<ul><li>Ý 1</li><li>Ý 2</li></ul>');
    expect(markdownToHtml('> Trích dẫn')).toBe('<blockquote>Trích dẫn</blockquote>');
  });

  it('chuyển ảnh hợp lệ và loại ảnh có URL không an toàn', () => {
    expect(markdownToHtml('![mô tả](https://x.com/a.jpg)')).toBe('<img src="https://x.com/a.jpg" alt="mô tả" />');
    expect(markdownToHtml('![x](javascript:alert)')).toBe('');
  });

  it('escape ký tự HTML trong văn bản để tránh XSS', () => {
    expect(markdownToHtml('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });
});
