// Trích text từ file tài liệu Ở CLIENT (Word/Excel/PDF/text) để đưa vào kho RAG.
// Deno Edge yếu về parse tài liệu nên làm ở trình duyệt: admin chọn file → trích text
// → gửi text + upload file gốc. KHÔNG bịa: chỉ lấy đúng nội dung file.

export type DocKind = 'docx' | 'xlsx' | 'pdf' | 'text';

// Giới hạn độ dài text an toàn để tránh payload quá lớn / chunk vô hạn.
export const MAX_DOC_TEXT = 200_000;

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map(l => l.trim()).join('\n')
    .trim()
    .slice(0, MAX_DOC_TEXT);
}

function extFromName(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}

export function kindFromFile(file: { name: string; type?: string }): DocKind | null {
  const ext = extFromName(file.name);
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return 'xlsx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'txt' || ext === 'md' || ext === 'text') return 'text';
  return null;
}

// Chuyển 1 sheet (mảng 2 chiều) → text: nối ô bằng tab, dòng bằng newline, bỏ ô rỗng đuôi.
function sheetRowsToText(rows: unknown[][]): string {
  return rows
    .map(row => (Array.isArray(row) ? row.map(c => (c == null ? '' : String(c))).join('\t').replace(/\t+$/, '') : ''))
    .filter(line => line.trim() !== '')
    .join('\n');
}

async function parseDocx(buf: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  return value;
}

async function parseXlsx(buf: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  return wb.SheetNames
    .map(name => {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false });
      const body = sheetRowsToText(rows);
      return body ? `# ${name}\n${body}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

async function parsePdf(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Worker: trỏ tới bản dựng kèm package (webpack 5 emit asset từ new URL) để không
  // phụ thuộc CDN ngoài. Bọc try để không chặn nếu bundler không resolve được.
  try {
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  } catch { /* dùng worker mặc định của pdfjs */ }
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(it => ('str' in it ? (it as { str: string }).str : '')).join(' ');
    if (text.trim()) parts.push(text);
  }
  return parts.join('\n\n');
}

// Trích text theo loại file. Trả text đã chuẩn hoá + loại đã nhận. Ném lỗi nếu định
// dạng không hỗ trợ hoặc file trống nội dung.
export async function parseDocument(file: File): Promise<{ text: string; kind: DocKind }> {
  const kind = kindFromFile(file);
  if (!kind) {
    throw new Error(`Định dạng "${extFromName(file.name) || 'không rõ'}" chưa hỗ trợ. Chỉ nhận Word (.docx), Excel (.xlsx/.csv), PDF, hoặc text (.txt/.md).`);
  }
  let raw = '';
  if (kind === 'text') {
    raw = await file.text();
  } else {
    const buf = await file.arrayBuffer();
    raw = kind === 'docx' ? await parseDocx(buf) : kind === 'xlsx' ? await parseXlsx(buf) : await parsePdf(buf);
  }
  const text = normalizeText(raw);
  if (!text) throw new Error('Không trích được nội dung văn bản từ file này (có thể là ảnh scan hoặc file rỗng).');
  return { text, kind };
}
