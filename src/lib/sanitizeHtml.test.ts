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

  it('loại raw iframe và video khỏi nội dung bài', () => {
    const out = sanitizeArticleHtml('<iframe src="https://evil.test/x"></iframe><video src="https://evil.test/x.mp4"></video>');
    expect(out).not.toContain('iframe');
    expect(out).not.toContain('video');
  });

  it('chỉ giữ marker YouTube có dữ liệu hợp lệ', () => {
    const out = sanitizeArticleHtml('<figure data-video-kind="youtube" data-video-id="abc123XYZ_1" data-video-title="Tour nhà" data-video-start="30"><figcaption>Giả mạo</figcaption></figure>');
    expect(out).toContain('data-video-kind="youtube"');
    expect(out).toContain('data-video-id="abc123XYZ_1"');
    expect(out).toContain('data-video-title="Tour nhà"');
    expect(out).toContain('data-video-start="30"');
  });

  it('loại marker video giả và data attribute tùy ý', () => {
    const out = sanitizeArticleHtml('<p data-admin="1">nội dung</p><figure data-video-kind="youtube" data-video-id="sai"><figcaption>x</figcaption></figure>');
    expect(out).not.toContain('data-admin');
    expect(out).not.toContain('data-video-kind');
  });

  it('giữ data-align ảnh nhưng chặn URI nguy hiểm', () => {
    const out = sanitizeArticleHtml('<img src="data:image/png;base64,x" data-align="center" onerror="alert(1)">');
    expect(out).toContain('data-align="center"');
    expect(out).not.toContain('src=');
    expect(out).not.toContain('onerror');
  });
});
