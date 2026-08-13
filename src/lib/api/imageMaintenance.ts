import { supabase } from '../supabase';
import { publicImageUrlToStoragePath, storageUrlToPublicImageUrl } from '../siteUrl';
import { compressImage } from '../imageCompress';

// Công cụ nén ảnh CŨ đã upload (admin-only). Mỗi ảnh được ghi thành object mới rồi
// cập nhật đúng các cột DB đang tham chiếu. Không ghi đè path cũ vì CDN có thể còn cache.

export interface ImageReference {
  table: string;
  rowId: string;
  column: string;
  index?: number;
}

export interface ScannedImage {
  table: string;
  label: string;
  url: string;
  references: ImageReference[];
}

async function scanTable(
  table: string,
  singleCol: string | null,
  arrayCol: string | null,
  labelCol: string,
): Promise<ScannedImage[]> {
  const cols = ['id', labelCol, singleCol, arrayCol].filter(Boolean).join(', ');
  const { data, error } = await supabase.from(table).select(cols);
  if (error || !data) return [];
  const out: ScannedImage[] = [];
  for (const row of data as unknown as Record<string, unknown>[]) {
    const rowId = String(row.id ?? '');
    if (!rowId) continue;
    const label = (row[labelCol] as string | null)?.trim() || `${table} ${rowId}`;
    if (singleCol) {
      const url = (row[singleCol] as string | null)?.trim();
      if (url) out.push({ table, label, url, references: [{ table, rowId, column: singleCol }] });
    }
    if (arrayCol) {
      const arr = row[arrayCol] as string[] | null;
      if (Array.isArray(arr)) {
        arr.forEach((value, index) => {
          const url = value?.trim();
          if (url) out.push({ table, label, url, references: [{ table, rowId, column: arrayCol, index }] });
        });
      }
    }
  }
  return out;
}

// Nhóm theo URL để chỉ nén/upload một lần nhưng vẫn giữ mọi vị trí DB phải cập nhật.
export async function adminScanImages(): Promise<ScannedImage[]> {
  const results = await Promise.all([
    scanTable('properties', 'image_url', 'images', 'title'),
    scanTable('news', 'image_url', null, 'title'),
    scanTable('neighborhoods', 'image_url', null, 'name'),
    scanTable('projects', 'image_url', 'images', 'name'),
    scanTable('banners', 'image_url', null, 'title'),
  ]);
  const grouped = new Map<string, ScannedImage>();
  for (const image of results.flat()) {
    const existing = grouped.get(image.url);
    if (!existing) {
      grouped.set(image.url, image);
      continue;
    }
    existing.references.push(...image.references);
    if (!existing.label.includes(image.label)) existing.label = `${existing.label}; ${image.label}`;
  }
  return [...grouped.values()];
}

export interface CompressResult {
  url: string;
  newUrl?: string;
  before: number;
  after: number;
  skipped: boolean;
  updatedReferences?: number;
  warning?: boolean;
  reason?: string;
}

export function buildCopyOnWritePath(path: string, mime: string, suffix: string): string {
  const slash = path.lastIndexOf('/');
  const folder = slash >= 0 ? path.slice(0, slash + 1) : '';
  const filename = slash >= 0 ? path.slice(slash + 1) : path;
  const base = filename.replace(/\.[^.]+$/, '') || 'image';
  const extension = mime === 'image/png' ? 'png' : 'jpg';
  const cleanSuffix = suffix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'optimized';
  return `${folder}${base}-optimized-${cleanSuffix}.${extension}`;
}

export function replaceArrayReferences(
  current: unknown[],
  references: ImageReference[],
  oldUrl: string,
  newUrl: string,
): { next: unknown[]; changed: number } {
  const next = [...current];
  let changed = 0;
  for (const reference of references) {
    if (reference.index !== undefined && next[reference.index] === oldUrl) {
      next[reference.index] = newUrl;
      changed += 1;
    }
  }
  return { next, changed };
}

async function updateReferenceGroup(
  image: ScannedImage,
  references: ImageReference[],
  newUrl: string,
): Promise<number> {
  const first = references[0];
  if (!first) return 0;

  if (first.index === undefined) {
    const { error, count } = await supabase
      .from(first.table)
      .update({ [first.column]: newUrl }, { count: 'exact' })
      .eq('id', first.rowId)
      .eq(first.column, image.url);
    if (error) throw error;
    return count ? references.length : 0;
  }

  // Gallery dùng read-modify-write nên phải compare-and-swap. Nhiều worker có thể
  // tối ưu các ảnh khác nhau trong cùng một mảng; retry sẽ merge trên bản mới nhất
  // thay vì worker cuối ghi đè kết quả của worker trước.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error: readError } = await supabase
      .from(first.table)
      .select(first.column)
      .eq('id', first.rowId)
      .maybeSingle();
    if (readError) throw readError;
    const current = (data as unknown as Record<string, unknown> | null)?.[first.column];
    if (!Array.isArray(current)) return 0;

    const { next, changed } = replaceArrayReferences(current, references, image.url, newUrl);
    if (changed === 0) return 0;

    const { error: updateError, count } = await supabase
      .from(first.table)
      .update({ [first.column]: next }, { count: 'exact' })
      .eq('id', first.rowId)
      .eq(first.column, current);
    if (updateError) throw updateError;
    if (count) return changed;
  }
  throw new Error('Danh sách ảnh vừa được thay đổi đồng thời; hãy quét và thử lại.');
}

// Nén một URL rồi copy-on-write sang object mới. Object cũ được giữ lại để URL cũ
// vẫn hoạt động nếu một reference đã đổi trong lúc công cụ đang chạy hoặc update DB lỗi.
export async function compressExistingImage(image: ScannedImage): Promise<CompressResult> {
  const { url } = image;
  const storage = publicImageUrlToStoragePath(url);
  if (!storage) return { url, before: 0, after: 0, skipped: true, reason: 'không nhận diện được path storage' };

  const fetchUrl = storageUrlToPublicImageUrl(url);
  let blob: Blob;
  try {
    const resp = await fetch(fetchUrl);
    if (!resp.ok) return { url, before: 0, after: 0, skipped: true, reason: `tải ảnh lỗi HTTP ${resp.status}` };
    blob = await resp.blob();
  } catch {
    return { url, before: 0, after: 0, skipped: true, reason: 'tải ảnh thất bại' };
  }

  const before = blob.size;
  const nameFromPath = storage.path.split('/').pop() || 'image';
  const original = new File([blob], nameFromPath, { type: blob.type });
  const compressed = await compressImage(original);
  if (compressed === original || compressed.size >= before) {
    return { url, before, after: before, skipped: true, reason: 'không nén nhỏ hơn được' };
  }

  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  const newPath = buildCopyOnWritePath(storage.path, compressed.type, suffix);
  const { error: uploadError } = await supabase.storage.from(storage.bucket).upload(newPath, compressed, {
    upsert: false,
    contentType: compressed.type,
  });
  if (uploadError) return { url, before, after: before, skipped: true, reason: uploadError.message };

  const { data: publicData } = supabase.storage.from(storage.bucket).getPublicUrl(newPath);
  const newUrl = storageUrlToPublicImageUrl(publicData.publicUrl);
  const groups = new Map<string, ImageReference[]>();
  for (const reference of image.references) {
    const key = JSON.stringify([reference.table, reference.rowId, reference.column]);
    const group = groups.get(key) ?? [];
    group.push(reference);
    groups.set(key, group);
  }

  let updatedReferences = 0;
  const failures: string[] = [];
  for (const references of groups.values()) {
    try {
      updatedReferences += await updateReferenceGroup(image, references, newUrl);
    } catch (error) {
      failures.push((error as Error).message);
    }
  }

  if (updatedReferences === 0) {
    return {
      url,
      newUrl,
      before,
      after: before,
      skipped: true,
      updatedReferences,
      warning: true,
      reason: failures[0] || 'reference đã thay đổi trước khi cập nhật; file mới được giữ an toàn',
    };
  }

  return {
    url,
    newUrl,
    before,
    after: compressed.size,
    skipped: false,
    updatedReferences,
    warning: failures.length > 0,
    reason: failures.length ? `còn ${failures.length} nhóm reference chưa cập nhật` : undefined,
  };
}
