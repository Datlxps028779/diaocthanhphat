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
