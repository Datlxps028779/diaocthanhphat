import { describe, it, expect } from 'vitest';
import { buildMetaDescription, META_DESCRIPTION_MAX } from './useSEOAutofill';

describe('buildMetaDescription', () => {
  it('lột hết thẻ HTML khỏi mô tả', () => {
    // Chuỗi thật người dùng gặp: mô tả HTML bị đổ thẳng vào meta description.
    const raw = '<h3>Bán đất Long Hòa - Dầu Tiếng, Bình Dương | 1.400m², sẵn 800m² thổ cư</h3><p>Cần bán lô đất đẹp tại <strong>xã Long Hòa</strong>.</p>';
    const out = buildMetaDescription(raw);
    expect(out).not.toMatch(/<[a-z/]/i);
    expect(out).toContain('Bán đất Long Hòa');
    expect(out).toContain('xã Long Hòa');
  });

  it('không bao giờ cắt giữa một thẻ HTML', () => {
    // Lỗi cũ: substring(0,155) cắt thô nên ra '<strong>' mở mà không đóng.
    const raw = '<p>' + 'Đất nền Bình Dương giá tốt. '.repeat(20) + '<strong>Liên hệ ngay</strong></p>';
    const out = buildMetaDescription(raw);
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it('giải mã entity HTML', () => {
    expect(buildMetaDescription('<p>Nhà &amp; đất Bình Dương</p>')).toContain('Nhà & đất');
  });

  it('không vượt quá giới hạn ký tự', () => {
    const raw = '<p>' + 'Bán đất thổ cư mặt tiền đường lớn. '.repeat(30) + '</p>';
    expect(buildMetaDescription(raw).length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it('cắt theo ranh giới từ, không cắt giữa chữ', () => {
    const raw = '<p>' + 'Bất động sản Thuận An Bình Dương pháp lý rõ ràng. '.repeat(10) + '</p>';
    const out = buildMetaDescription(raw);
    // Bỏ dấu … rồi kiểm ký tự cuối không phải chữ dở dang giữa từ
    const body = out.replace(/…$/, '').trimEnd();
    expect(body.endsWith(' ')).toBe(false);
    expect(out.endsWith('…')).toBe(true);
  });

  it('mô tả ngắn thì giữ nguyên, không thêm dấu ba chấm', () => {
    const out = buildMetaDescription('<p>Bán nhà Dĩ An 3 tỷ.</p>');
    expect(out).toBe('Bán nhà Dĩ An 3 tỷ.');
    expect(out.endsWith('…')).toBe(false);
  });

  it('mô tả text thuần vẫn chạy bình thường', () => {
    expect(buildMetaDescription('Bán đất Dĩ An chính chủ')).toBe('Bán đất Dĩ An chính chủ');
  });

  it('đếm theo KÝ TỰ THẬT, không phải code unit UTF-16', () => {
    // Postgres char_length() đếm code point; JS .length đếm code unit nên mỗi emoji
    // ngoài BMP bị tính 2. Lệch nhau ⇒ cùng một tin ra hai meta khác nhau giữa DB và app.
    const raw = '<p>🔥 ' + 'Đất nền Bình Dương giá tốt. '.repeat(20) + '</p>';
    const out = buildMetaDescription(raw);
    expect([...out].length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it('không cắt vỡ emoji thành ký tự lỗi', () => {
    // slice() theo code unit có thể cắt đứt cặp surrogate → nửa emoji (�).
    // Dựng chuỗi để ranh giới cắt rơi đúng giữa một emoji.
    for (let pad = 148; pad <= 158; pad++) {
      const raw = 'a'.repeat(pad) + '🔥🔥🔥 còn nữa phía sau cho dài ra';
      const out = buildMetaDescription(raw);
      expect(out).not.toContain('�');
      // Chỉ bắt surrogate LẺ (nửa cặp); cặp hoàn chỉnh của emoji hợp lệ thì bỏ qua.
      expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
  });

  it('không để dư khoảng trắng trước dấu câu', () => {
    // stripHtml đổi thẻ thành khoảng trắng nên "<strong>xã Long Hòa</strong>," ra
    // "xã Long Hòa ," — dấu phẩy lơ lửng này hiện thẳng trên kết quả Google.
    const out = buildMetaDescription('<p>Cần bán lô đất tại <strong>xã Long Hòa</strong>, pháp lý rõ ràng<em>.</em></p>');
    expect(out).not.toMatch(/\s+[,.;:!?]/);
    expect(out).toContain('xã Long Hòa, pháp lý');
  });

  it('rỗng hoặc thiếu thì trả chuỗi rỗng', () => {
    expect(buildMetaDescription('')).toBe('');
    expect(buildMetaDescription(undefined as unknown as string)).toBe('');
    expect(buildMetaDescription('   ')).toBe('');
    expect(buildMetaDescription('<p></p>')).toBe('');
  });
});
