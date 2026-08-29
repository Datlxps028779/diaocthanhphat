import { describe, expect, it } from 'vitest';
import { buildAiRecoRequestBody, normalizeRecoReason } from './aiReco';

describe('buildAiRecoRequestBody', () => {
  it('chỉ gửi profile ẩn danh và candidateIds, không gửi metadata listing', () => {
    const body = buildAiRecoRequestBody(
      { areas: ['Bình Dương'], types: ['Nhà phố'], listingTypes: ['mua bán'] },
      [{
        id: '11111111-1111-4111-8111-111111111111',
        revision: '2026-08-29T00:00:00Z',
        title: 'Không gửi title',
        area: 'Bình Dương',
        type: 'Nhà phố',
        listingType: 'mua_ban',
        district: 'Dĩ An',
      }],
    );
    expect(body).toEqual({
      profileDigest: { areas: ['Bình Dương'], types: ['Nhà phố'], listingTypes: ['mua bán'] },
      candidateIds: ['11111111-1111-4111-8111-111111111111'],
    });
  });
});

describe('normalizeRecoReason', () => {
  it('chỉ cho phép các lý do deterministic đã được duyệt', () => {
    expect(normalizeRecoReason('Cùng khu vực bạn đang quan tâm')).toBe('Cùng khu vực bạn đang quan tâm');
    expect(normalizeRecoReason('  Phù hợp nhu cầu cho thuê của bạn  ')).toBe('Phù hợp nhu cầu cho thuê của bạn');
  });

  it('chặn tuyên bố do model hoặc listing title chèn vào', () => {
    expect(normalizeRecoReason('Cam kết sinh lời 30%')).toBe('');
    expect(normalizeRecoReason('Giảm giá sốc, gọi ngay')).toBe('');
    expect(normalizeRecoReason(null)).toBe('');
  });
});
