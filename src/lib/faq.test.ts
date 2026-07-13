import { describe, it, expect } from 'vitest';
import { FAQ_ITEMS, buildFaqJsonLd, type FaqItem } from './faq';

describe('faq — FAQPage schema cho trang chủ', () => {
  it('FAQ_ITEMS có nội dung, mỗi mục đủ q + a không rỗng', () => {
    expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(4);
    for (const item of FAQ_ITEMS) {
      expect(item.q.trim().length).toBeGreaterThan(0);
      expect(item.a.trim().length).toBeGreaterThan(0);
    }
  });

  it('buildFaqJsonLd dựng đúng cấu trúc FAQPage schema.org', () => {
    const ld = buildFaqJsonLd() as {
      '@context': string; '@type': string;
      mainEntity: { '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }[];
    };
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity).toHaveLength(FAQ_ITEMS.length);
  });

  it('mỗi entity là Question có acceptedAnswer là Answer, khớp nội dung gốc', () => {
    const ld = buildFaqJsonLd() as {
      mainEntity: { '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }[];
    };
    ld.mainEntity.forEach((e, i) => {
      expect(e['@type']).toBe('Question');
      expect(e.name).toBe(FAQ_ITEMS[i].q);
      expect(e.acceptedAnswer['@type']).toBe('Answer');
      expect(e.acceptedAnswer.text).toBe(FAQ_ITEMS[i].a);
    });
  });

  it('nhận danh sách tùy chỉnh (không phụ thuộc FAQ_ITEMS mặc định)', () => {
    const custom: FaqItem[] = [{ q: 'Câu hỏi X?', a: 'Trả lời X.' }];
    const ld = buildFaqJsonLd(custom) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(ld.mainEntity).toHaveLength(1);
    expect(ld.mainEntity[0].name).toBe('Câu hỏi X?');
    expect(ld.mainEntity[0].acceptedAnswer.text).toBe('Trả lời X.');
  });
});
