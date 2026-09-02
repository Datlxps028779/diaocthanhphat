import { describe, expect, it } from 'vitest';
import { buildCopyOnWritePath, replaceArrayReferences, toPostgresTextArrayLiteral } from './imageMaintenance';

describe('buildCopyOnWritePath', () => {
  it('tạo object JPEG mới cùng thư mục, không ghi đè path cũ', () => {
    expect(buildCopyOnWritePath('properties/can-ho.png', 'image/jpeg', 'a1b2c3d4'))
      .toBe('properties/can-ho-optimized-a1b2c3d4.jpg');
  });

  it('giữ định dạng PNG khi ảnh nén vẫn có alpha', () => {
    expect(buildCopyOnWritePath('news/anh-bia.png', 'image/png', 'v2'))
      .toBe('news/anh-bia-optimized-v2.png');
  });

  it('lọc ký tự lạ khỏi suffix để không tạo path nguy hiểm', () => {
    expect(buildCopyOnWritePath('banner.jpg', 'image/jpeg', '../release 01'))
      .toBe('banner-optimized-release01.jpg');
  });
});

describe('toPostgresTextArrayLiteral', () => {
  it('tạo literal hợp lệ cho danh sách URL', () => {
    expect(toPostgresTextArrayLiteral(['https://example.com/a.jpg', 'https://example.com/b.jpg']))
      .toBe('{"https://example.com/a.jpg","https://example.com/b.jpg"}');
  });

  it('escape ký tự đặc biệt và giữ NULL', () => {
    expect(toPostgresTextArrayLiteral(['a,b', 'a"b', 'a\\b', null]))
      .toBe('{"a,b","a\\"b","a\\\\b",NULL}');
  });

  it('tạo literal rỗng', () => {
    expect(toPostgresTextArrayLiteral([])).toBe('{}');
  });
});

describe('replaceArrayReferences', () => {
  it('chỉ thay đúng vị trí vẫn còn URL cũ', () => {
    const result = replaceArrayReferences(
      ['a.jpg', 'b.jpg', 'a.jpg'],
      [
        { table: 'properties', rowId: '1', column: 'images', index: 0 },
        { table: 'properties', rowId: '1', column: 'images', index: 2 },
      ],
      'a.jpg',
      'a-v2.jpg',
    );
    expect(result).toEqual({ next: ['a-v2.jpg', 'b.jpg', 'a-v2.jpg'], changed: 2 });
  });

  it('không khôi phục vị trí đã được chỉnh sửa đồng thời', () => {
    const result = replaceArrayReferences(
      ['editor-new.jpg', 'b.jpg'],
      [{ table: 'properties', rowId: '1', column: 'images', index: 0 }],
      'a.jpg',
      'a-v2.jpg',
    );
    expect(result).toEqual({ next: ['editor-new.jpg', 'b.jpg'], changed: 0 });
  });
});
