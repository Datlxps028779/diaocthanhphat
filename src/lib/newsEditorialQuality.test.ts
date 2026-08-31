import { describe, expect, it } from 'vitest';
import { evaluateNewsEditorialQuality } from './newsEditorialQuality';

function article(overrides: { citations?: unknown; faq?: unknown } = {}) {
  return {
    citations: [
      { title: 'Cổng thông tin địa phương', url: 'https://example.gov.vn/data' },
      { title: 'Dữ liệu Chọn Nhà Việt', url: 'https://chonhaviet.com/du-lieu-gia' },
    ],
    faq: [{ question: 'Dữ liệu này có giới hạn gì?', answer: 'Người đọc cần đối chiếu thời điểm, phạm vi và nguồn của từng thông tin.' }],
    ...overrides,
  } as never;
}

describe('evaluateNewsEditorialQuality', () => {
  it('permits publication only when there are two distinct, reviewable sources', () => {
    const result = evaluateNewsEditorialQuality(article());

    expect(result.citationStatus).toBe('ready');
    expect(result.faqStatus).toBe('ready');
    expect(result.validCitationCount).toBe(2);
    expect(result.citationIssues).toHaveLength(0);
  });

  it('flags legacy articles with no citations without treating missing FAQ as a publish blocker', () => {
    const result = evaluateNewsEditorialQuality(article({ citations: [], faq: [] }));

    expect(result.canPublish).toBe(false);
    expect(result.citationIssues.map(issue => issue.code)).toContain('CITATION_COUNT');
    expect(result.faqIssues.map(issue => issue.code)).toContain('FAQ_COUNT');
  });

  it('rejects invalid and duplicate citation records', () => {
    const result = evaluateNewsEditorialQuality(article({
      citations: [
        { title: 'Nguồn trùng một', url: 'https://example.gov.vn/data' },
        { title: 'Nguồn trùng hai', url: 'https://example.gov.vn/data' },
        { title: 'Nguồn sai', url: 'javascript:alert(1)' },
      ],
    }));

    expect(result.canPublish).toBe(false);
    expect(result.citationIssues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'CITATION_COUNT',
      'CITATION_URL',
      'CITATION_DUPLICATE',
    ]));
  });

  it('accepts normal HTTP(S) source URLs with ports, paths, queries and fragments', () => {
    const result = evaluateNewsEditorialQuality(article({
      citations: [
        { title: 'Nguồn A', url: 'https://example.gov.vn:8443/data?year=2026#latest' },
        { title: 'Nguồn B', url: 'http://example.com/source' },
      ],
    }));

    expect(result.canPublish).toBe(true);
    expect(result.citationStatus).toBe('ready');
  });
  it('does not permit valid sources to hide an additional malformed citation', () => {
    const result = evaluateNewsEditorialQuality(article({
      citations: [
        { title: 'Nguồn A', url: 'https://example.gov.vn/a' },
        { title: 'Nguồn B', url: 'https://example.gov.vn/b' },
        { title: '', url: 'not-a-url' },
      ],
    }));

    expect(result.canPublish).toBe(false);
    expect(result.citationStatus).toBe('needs-review');
    expect(result.validCitationCount).toBe(2);
    expect(result.citationIssues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'CITATION_TITLE',
      'CITATION_URL',
    ]));
  });

  it('marks incomplete FAQ for editorial review but keeps source-qualified article publishable', () => {
    const result = evaluateNewsEditorialQuality(article({
      faq: [{ question: 'Câu hỏi có nhưng chưa có đáp án?', answer: '' }],
    }));

    expect(result.canPublish).toBe(true);
    expect(result.faqStatus).toBe('needs-review');
    expect(result.faqIssues.map(issue => issue.code)).toContain('FAQ_ANSWER');
  });
});
