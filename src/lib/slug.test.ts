import { describe, it, expect } from 'vitest';
import { buildAgentProfileSlug, buildSlug, buildUniqueSlug, isSafePublicSlugSegment, isValidSlug } from './slug';

describe('buildSlug', () => {
  it('bỏ dấu tiếng Việt và chuyển về chữ thường có gạch nối', () => {
    expect(buildSlug('Bán nhà mặt tiền Quận 1')).toBe('ban-nha-mat-tien-quan-1');
  });

  it('chuyển đ/Đ thành d', () => {
    expect(buildSlug('Căn hộ Đảo Kim Cương')).toBe('can-ho-dao-kim-cuong');
  });

  it('gộp khoảng trắng thừa và trim gạch nối đầu/cuối', () => {
    expect(buildSlug('  Nhà   phố  ')).toBe('nha-pho');
  });

  it('loại ký tự đặc biệt', () => {
    expect(buildSlug('Đất!!! nền@@@ giá rẻ')).toBe('dat-nen-gia-re');
  });

  it('trả fallback khi tiêu đề rỗng', () => {
    expect(buildSlug('')).toBe('bat-dong-san');
  });

  it('giới hạn tối đa 80 ký tự', () => {
    const long = 'a'.repeat(200);
    expect(buildSlug(long).length).toBeLessThanOrEqual(80);
  });
});

describe('buildAgentProfileSlug', () => {
  it('sinh slug readable deterministic từ tên hồ sơ', () => {
    expect(buildAgentProfileSlug('Võ Thị Mỹ Nhân')).toBe('vo-thi-my-nhan');
    expect(buildAgentProfileSlug('Võ Thị Mỹ Nhân')).toBe(buildAgentProfileSlug('Võ Thị Mỹ Nhân'));
  });
});

describe('buildUniqueSlug', () => {
  it('gồm phần slug từ tiêu đề + hậu tố ngẫu nhiên', () => {
    const s = buildUniqueSlug('Nhà phố');
    expect(s).toMatch(/^nha-pho-[a-z0-9]{4,8}$/);
  });

  it('sinh hậu tố khác nhau giữa 2 lần gọi (chống trùng)', () => {
    const a = buildUniqueSlug('Cùng một tiêu đề');
    const b = buildUniqueSlug('Cùng một tiêu đề');
    expect(a).not.toBe(b);
  });
});

describe('isValidSlug', () => {
  it('accepts the canonical lower-case ASCII slug shape', () => {
    expect(isValidSlug('tin-tuc-binh-duong-2026')).toBe(true);
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('Tin-Tuc')).toBe(false);
    expect(isValidSlug('tin tuc')).toBe(false);
    expect(isValidSlug('tin-tuc/2026')).toBe(false);
    expect(isValidSlug('tin-tuc-')).toBe(false);
    expect(isValidSlug('-tin-tuc')).toBe(false);
    expect(isValidSlug(null)).toBe(false);
  });
});


describe('isSafePublicSlugSegment', () => {
  it('accepts a legacy malformed segment only for cache purge', () => {
    expect(isSafePublicSlugSegment('bai-viet-')).toBe(true);
    expect(isSafePublicSlugSegment('Tin-Tuc')).toBe(true);
  });

  it('rejects path delimiters and query/hash injection', () => {
    expect(isSafePublicSlugSegment('tin-tuc/2026')).toBe(false);
    expect(isSafePublicSlugSegment('tin-tuc?x=1')).toBe(false);
    expect(isSafePublicSlugSegment('tin-tuc#section')).toBe(false);
    expect(isSafePublicSlugSegment('-tin-tuc')).toBe(false);
  });
});
