import { describe, expect, it } from 'vitest';
import { verifiedAwards } from './verifiedAwards';

describe('verifiedAwards', () => {
  it('only returns awards with a title and an HTTP(S) source', () => {
    expect(verifiedAwards([
      { title: 'Có nguồn', source_url: 'https://issuer.example/certificate', issuer: 'Đơn vị cấp', year: '2024' },
      { title: 'Thiếu nguồn', source_url: '' },
      { title: 'Sai giao thức', source_url: 'javascript:alert(1)' },
      { source_url: 'https://issuer.example/missing-title' },
    ])).toEqual([{
      title: 'Có nguồn',
      issuer: 'Đơn vị cấp',
      year: '2024',
      description: '',
      image: '',
      sourceUrl: 'https://issuer.example/certificate',
    }]);
  });

  it('preserves optional display details for verified awards', () => {
    expect(verifiedAwards([{
      title: 'Chứng nhận có ảnh',
      source_url: 'http://issuer.example/certificate',
      description: 'Thông tin do đơn vị cấp công bố.',
      image: 'https://cdn.example/certificate.jpg',
    }])[0]).toMatchObject({
      description: 'Thông tin do đơn vị cấp công bố.',
      image: 'https://cdn.example/certificate.jpg',
    });
  });
});
