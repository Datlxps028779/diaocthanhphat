import { describe, expect, it } from 'vitest';
import {
  MAX_RECO_BODY_BYTES,
  MAX_RECO_CANDIDATES,
  listingTypeLabel,
  normalizeRecoInput,
} from '../../supabase/functions/ai-reco/contract';

const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';

function validBody() {
  return {
    profileDigest: {
      areas: ['Bình Dương'],
      types: ['Nhà phố'],
      listingTypes: ['mua bán'],
    },
    candidates: [
      { id: ID_1, title: 'Client metadata is ignored' },
      { id: ID_2 },
    ],
  };
}

describe('ai-reco request contract', () => {
  it('chỉ lấy candidate id và chuẩn hóa digest giới hạn', () => {
    expect(normalizeRecoInput(validBody())).toEqual({
      profileDigest: {
        areas: ['Bình Dương'],
        types: ['Nhà phố'],
        listingTypes: ['mua bán'],
      },
      candidateIds: [ID_1, ID_2],
    });
  });

  it('hỗ trợ contract candidateIds mới và loại id trùng', () => {
    expect(normalizeRecoInput({
      profileDigest: {},
      candidateIds: [ID_1, ID_1, ID_2],
    })?.candidateIds).toEqual([ID_1, ID_2]);
  });

  it('từ chối id không phải UUID và payload candidate vượt giới hạn', () => {
    expect(normalizeRecoInput({ ...validBody(), candidates: [{ id: 'fake' }] })).toBeNull();
    expect(normalizeRecoInput({
      ...validBody(),
      candidates: Array.from({ length: MAX_RECO_CANDIDATES + 1 }, () => ({ id: ID_1 })),
    })).toBeNull();
  });

  it('từ chối digest sai kiểu, quá dài hoặc chứa control character', () => {
    expect(normalizeRecoInput({ ...validBody(), profileDigest: { areas: 'Bình Dương' } })).toBeNull();
    expect(normalizeRecoInput({ ...validBody(), profileDigest: { areas: ['x'.repeat(81)] } })).toBeNull();
    expect(normalizeRecoInput({ ...validBody(), profileDigest: { areas: ['Bình\nDương'] } })).toBeNull();
  });

  it('map đúng cả bốn listing type legacy/hiện hành', () => {
    expect(listingTypeLabel('mua_ban')).toBe('mua bán');
    expect(listingTypeLabel('cho_thue')).toBe('cho thuê');
    expect(listingTypeLabel('can_mua')).toBe('cần mua');
    expect(listingTypeLabel('can_thue')).toBe('cần thuê');
    expect(listingTypeLabel('khac')).toBeNull();
  });

  it('giữ body budget đủ nhỏ cho Edge Function trả phí', () => {
    expect(MAX_RECO_BODY_BYTES).toBeLessThanOrEqual(32_000);
  });
});
