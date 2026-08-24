import { describe, expect, it } from 'vitest';
import {
  getCollectionDefinition,
  parseContentCollection,
  serializeContentCollection,
} from './pageContentSchema';

describe('page content collections', () => {
  const timeline = getCollectionDefinition('about', 'timeline', 'items');

  it('parses a valid structured collection', () => {
    expect(parseContentCollection(JSON.stringify({ version: 1, items: [
      { year: '2024', title: 'Ra mắt nền tảng', description: 'Nội dung đã kiểm tra.' },
    ] }), timeline)).toEqual([
      { year: '2024', title: 'Ra mắt nền tảng', description: 'Nội dung đã kiểm tra.' },
    ]);
  });

  it('reads legacy delimiter records while content is being migrated', () => {
    expect(parseContentCollection('2024|Ra mắt nền tảng|Nội dung đã kiểm chứng', timeline)).toEqual([
      { year: '2024', title: 'Ra mắt nền tảng', description: 'Nội dung đã kiểm chứng' },
    ]);
  });

  it('rejects malformed JSON and records missing required fields', () => {
    expect(parseContentCollection('{invalid', timeline)).toEqual([]);
    expect(parseContentCollection(JSON.stringify({ items: [{ year: '2024', title: 'Thiếu mô tả' }] }), timeline)).toEqual([]);
  });

  it('parses legacy awards as editable draft records without rendering them as one JSON string', () => {
    const awards = getCollectionDefinition('about', 'awards', 'items');
    expect(parseContentCollection('Giải thưởng A\nChứng nhận B', awards)).toEqual([
      { title: 'Giải thưởng A', source_url: '' },
      { title: 'Chứng nhận B', source_url: '' },
    ]);
  });

  it('keeps incomplete awards drafts so the admin can add evidence before publishing', () => {
    const awards = getCollectionDefinition('about', 'awards', 'items');
    const value = serializeContentCollection([{ title: 'Chứng nhận A' }], awards);
    expect(parseContentCollection(value, awards)).toEqual([{ title: 'Chứng nhận A' }]);
  });

  it('maps legacy JSON awards text into editable draft titles', () => {
    const awards = getCollectionDefinition('about', 'awards', 'items');
    expect(parseContentCollection(JSON.stringify({ version: 1, items: [{ text: 'Chứng nhận cũ' }] }), awards)).toEqual([
      { title: 'Chứng nhận cũ', source_url: '' },
    ]);
  });

  it('serializes only complete records and preserves list fields', () => {
    const investment = getCollectionDefinition('invest', 'opportunities', 'items');
    const output = serializeContentCollection([
      { title: 'Khu vực có dữ liệu', description: 'Nội dung có nguồn.', features: ['Điểm 1', 'Điểm 2'] },
      { title: 'Thiếu diễn giải' },
    ], investment);
    expect(parseContentCollection(output, investment)).toEqual([
      { title: 'Khu vực có dữ liệu', description: 'Nội dung có nguồn.', features: ['Điểm 1', 'Điểm 2'] },
    ]);
  });
});
