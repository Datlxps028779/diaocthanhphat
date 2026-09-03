import { describe, it, expect } from 'vitest';
import { parseSchemaJson, validateSchemaMarkup, mergeSchema } from './schemaValidation';

describe('parseSchemaJson', () => {
  it('chuỗi rỗng → hợp lệ, schema null', () => {
    const r = parseSchemaJson('   ');
    expect(r.valid).toBe(true);
    expect(r.schema).toBeNull();
  });

  it('JSON hợp lệ dạng object → trả object', () => {
    const r = parseSchemaJson('{"@type":"NewsArticle"}');
    expect(r.valid).toBe(true);
    expect(r.schema).toEqual({ '@type': 'NewsArticle' });
  });

  it('JSON sai cú pháp → không throw, báo lỗi', () => {
    const r = parseSchemaJson('{ khong-hop-le ');
    expect(r.valid).toBe(false);
    expect(r.schema).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('JSON hợp lệ nhưng không phải object (mảng/số) → từ chối', () => {
    expect(parseSchemaJson('[1,2,3]').valid).toBe(false);
    expect(parseSchemaJson('42').valid).toBe(false);
    expect(parseSchemaJson('"chuoi"').valid).toBe(false);
  });
});

describe('validateSchemaMarkup', () => {
  it('null → hợp lệ, schema null (không có gì để merge)', () => {
    const r = validateSchemaMarkup(null, 'news');
    expect(r.valid).toBe(true);
    expect(r.schema).toBeNull();
  });

  it('không phải object → từ chối', () => {
    expect(validateSchemaMarkup('x' as unknown, 'news').valid).toBe(false);
    expect(validateSchemaMarkup([1] as unknown, 'news').valid).toBe(false);
  });

  it('@type phù hợp target → hợp lệ', () => {
    const r = validateSchemaMarkup({ '@context': 'https://schema.org', '@type': 'NewsArticle' }, 'news');
    expect(r.valid).toBe(true);
    expect(r.schema).not.toBeNull();
  });

  it('@type không phù hợp target → cảnh báo + không hợp lệ', () => {
    const r = validateSchemaMarkup({ '@type': 'RealEstateListing' }, 'news');
    expect(r.valid).toBe(false);
    expect(r.warnings.some(w => w.includes('không phù hợp'))).toBe(true);
  });

  it('thiếu @type → cảnh báo', () => {
    const r = validateSchemaMarkup({ '@context': 'https://schema.org' }, 'news');
    expect(r.warnings.some(w => w.includes('Thiếu @type'))).toBe(true);
  });

  it('URL javascript: → chặn (chống XSS)', () => {
    const r = validateSchemaMarkup(
      { '@type': 'NewsArticle', url: 'javascript:alert(1)' },
      'news',
    );
    expect(r.valid).toBe(false);
    expect(r.warnings.some(w => w.includes('không an toàn'))).toBe(true);
  });

  it('URL javascript: lồng trong mảng sameAs → vẫn chặn', () => {
    const r = validateSchemaMarkup(
      { '@type': 'NewsArticle', sameAs: ['https://ok.vn', 'javascript:evil()'] },
      'news',
    );
    expect(r.warnings.some(w => w.includes('không an toàn'))).toBe(true);
  });

  it('schema quá lớn → từ chối', () => {
    const big = { '@type': 'NewsArticle', blob: 'x'.repeat(60_000) };
    const r = validateSchemaMarkup(big, 'news');
    expect(r.valid).toBe(false);
    expect(r.warnings.some(w => w.includes('quá lớn'))).toBe(true);
  });

  it('@context không phải schema.org → cảnh báo', () => {
    const r = validateSchemaMarkup({ '@context': 'https://example.com', '@type': 'NewsArticle' }, 'news');
    expect(r.warnings.some(w => w.includes('@context'))).toBe(true);
  });
});

describe('mergeSchema', () => {
  const base = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: 'THẬT', url: 'https://real' };

  it('custom không hợp lệ → giữ nguyên base', () => {
    const { schema } = mergeSchema(base, 'rác', 'news', ['@type', 'headline', 'url']);
    expect(schema).toEqual(base);
  });

  it('custom hợp lệ chỉ merge field bổ sung, KHÔNG ghi đè locked key', () => {
    const custom = { '@type': 'NewsArticle', headline: 'GIẢ', url: 'https://fake', extra: 'them' };
    const { schema } = mergeSchema(base, custom, 'news', ['@type', 'headline', 'url']);
    expect(schema.headline).toBe('THẬT');
    expect(schema.url).toBe('https://real');
    expect(schema.extra).toBe('them');
  });

  it('locked key bị bỏ khỏi custom nếu base không có field đó', () => {
    const custom = { '@type': 'NewsArticle', articleBody: 'Nội dung cũ' };
    const { schema } = mergeSchema(base, custom, 'news', ['articleBody']);
    expect(schema).not.toHaveProperty('articleBody');
  });

  it('custom null → giữ nguyên base', () => {
    const { schema } = mergeSchema(base, null, 'news', ['@type']);
    expect(schema).toEqual(base);
  });
});
