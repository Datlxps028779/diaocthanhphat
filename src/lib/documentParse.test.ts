import { describe, it, expect } from 'vitest';
import { normalizeText, kindFromFile, parseDocument, MAX_DOC_TEXT } from './documentParse';

describe('normalizeText', () => {
  it('chuẩn hoá xuống dòng, gộp khoảng trắng, trim từng dòng', () => {
    expect(normalizeText('  a  b \r\n c\t\td  ')).toBe('a b\nc d');
  });

  it('gộp nhiều dòng trống thành tối đa 1 dòng trống', () => {
    expect(normalizeText('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('cắt theo giới hạn độ dài an toàn', () => {
    const long = 'x'.repeat(MAX_DOC_TEXT + 5000);
    expect(normalizeText(long).length).toBe(MAX_DOC_TEXT);
  });
});

describe('kindFromFile', () => {
  it('nhận diện đúng loại theo đuôi file', () => {
    expect(kindFromFile({ name: 'a.docx' })).toBe('docx');
    expect(kindFromFile({ name: 'a.xlsx' })).toBe('xlsx');
    expect(kindFromFile({ name: 'a.xls' })).toBe('xlsx');
    expect(kindFromFile({ name: 'a.csv' })).toBe('xlsx');
    expect(kindFromFile({ name: 'a.pdf' })).toBe('pdf');
    expect(kindFromFile({ name: 'a.txt' })).toBe('text');
    expect(kindFromFile({ name: 'a.md' })).toBe('text');
  });

  it('trả null cho định dạng không hỗ trợ', () => {
    expect(kindFromFile({ name: 'a.exe' })).toBeNull();
    expect(kindFromFile({ name: 'noext' })).toBeNull();
  });
});

describe('parseDocument', () => {
  it('trích text từ file .txt và chuẩn hoá', async () => {
    const file = new File(['  Xin chào\r\n\r\n\r\n  thế giới  '], 'note.txt', { type: 'text/plain' });
    const r = await parseDocument(file);
    expect(r.kind).toBe('text');
    expect(r.text).toBe('Xin chào\n\nthế giới');
  });

  it('ném lỗi khi định dạng không hỗ trợ', async () => {
    const file = new File(['x'], 'virus.exe', { type: 'application/octet-stream' });
    await expect(parseDocument(file)).rejects.toThrow(/chưa hỗ trợ/);
  });

  it('ném lỗi khi file rỗng nội dung', async () => {
    const file = new File(['   \n\n   '], 'empty.txt', { type: 'text/plain' });
    await expect(parseDocument(file)).rejects.toThrow(/Không trích được/);
  });
});
