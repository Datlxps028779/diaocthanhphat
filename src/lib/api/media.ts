import { supabase, type Property, type PropertyFavorite, type UserFavorite, type UserMedia } from '../supabase';
import { buildSlug } from '../slug';
import { publicImageUrlToStoragePath, storageUrlToPublicImageUrl } from '../siteUrl';
import { compressImage } from '../imageCompress';

// Tên file chuẩn SEO: {folder}/{slug mô tả}-{hậu tố ngắn}.{ext} thay vì rác ngẫu nhiên.
// Ưu tiên caption (vd tiêu đề tin), else tên file gốc, else folder. Google đánh giá
// tên file theo mức mô tả — tên có từ khoá tốt hơn "1721739600-x8f2k.jpg". Giữ hậu tố
// ngẫu nhiên để không đụng độ (upsert:false).
function seoFilename(file: File, folder: string, caption?: string): string {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const base = file.name.replace(/\.[^.]+$/, '');
  const slug = buildSlug(caption?.trim() || base || folder);
  return `${folder}/${slug}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

function publicImageFolder(folder: string, userId?: string, isAdmin = false): string {
  const clean = folder.split('/').filter(Boolean).join('/') || 'properties';
  if (isAdmin) return clean;
  if (!userId) throw new Error('Bạn cần đăng nhập để tải ảnh lên.');
  return `${clean}/${userId}`;
}

// ─── Image Upload ─────────────────────────────────────────────────────────────
// Chỉ cho phép ảnh raster an toàn. Chặn SVG/HTML — chúng có thể chứa <script> →
// stored XSS khi mở trực tiếp URL public. Kiểm cả MIME lẫn đuôi file.
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'image/x-icon', 'image/vnd.microsoft.icon',
]);
const ALLOWED_IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'ico']);

function assertSafeImage(file: File) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const mimeOk = ALLOWED_IMAGE_MIME.has(file.type);
  const extOk = ALLOWED_IMAGE_EXT.has(ext);
  if (!mimeOk || !extOk) {
    throw new Error(`Định dạng "${file.type || ext || 'không rõ'}" không được phép. ` +
      `Chỉ chấp nhận ảnh JPG, PNG, WEBP, GIF, AVIF.`);
  }
}

// Đọc cấu hình dung lượng file tối đa từ site_settings
export async function getMaxFileSize(): Promise<number> {
  const { data } = await supabase.from('site_settings').select('value').eq('key', 'max_file_size').maybeSingle();
  const maxSize = parseInt((data?.value as string) ?? '3'); // Mặc định 3MB
  return maxSize;
}

// Upload ảnh với bucket phân tách: admin-uploads hoặc user-uploads
export async function uploadImage(file: File, folder = 'properties', isAdmin = false, caption?: string): Promise<string> {
  assertSafeImage(file);
  // Nén ở client trước khi đo dung lượng: PNG/ảnh chụp nặng → JPEG ≤1600px cho nhẹ
  // (ảnh OG share Zalo/FB không bị bỏ qua). PNG trong suốt giữ nguyên format.
  file = await compressImage(file);
  // Kiểm tra dung lượng file
  const maxSize = await getMaxFileSize();
  const maxSizeBytes = maxSize * 1024 * 1024; // Chuyển MB sang bytes
  if (file.size > maxSizeBytes) {
    throw new Error(`File vượt quá dung lượng cho phép (${maxSize}MB). Vui lòng chọn file nhỏ hơn.`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  const bucketName = 'public-media';
  const storageFolder = publicImageFolder(folder, user?.id, isAdmin);
  const filename = seoFilename(file, storageFolder, caption);

  // upsert:false — tên đã random nên không đụng độ; tránh ghi đè file người khác.
  const { error } = await supabase.storage.from(bucketName).upload(filename, file, { upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(bucketName).getPublicUrl(filename);
  const publicUrl = storageUrlToPublicImageUrl(data.publicUrl);

  // Ghi metadata vào user_media để hỗ trợ thư viện ảnh
  try {
    if (user) {
      await supabase.from('user_media').insert({
        user_id: user.id,
        url: publicUrl,
        filename: file.name,
        folder,
        mime_type: file.type || 'image/jpeg',
        size_bytes: file.size,
      });
    }
  } catch { /* silent — không chặn upload nếu metadata fail */ }

  return publicUrl;
}

// Upload nhiều ảnh
export async function uploadImages(files: File[], folder = 'properties', isAdmin = false): Promise<string[]> {
  const maxSize = await getMaxFileSize();
  const maxSizeBytes = maxSize * 1024 * 1024;

  // Nén trước khi validate size: ảnh nặng nén xong mới đo, không bị chặn oan.
  for (const file of files) assertSafeImage(file);
  files = await Promise.all(files.map(compressImage));
  for (const file of files) {
    if (file.size > maxSizeBytes) {
      throw new Error(`File "${file.name}" vượt quá dung lượng cho phép (${maxSize}MB).`);
    }
  }

  const bucketName = 'public-media';
  const urls: string[] = [];
  const { data: { user } } = await supabase.auth.getUser();
  const storageFolder = publicImageFolder(folder, user?.id, isAdmin);

  for (const file of files) {
    const filename = seoFilename(file, storageFolder);
    const { error } = await supabase.storage.from(bucketName).upload(filename, file, { upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from(bucketName).getPublicUrl(filename);
    const publicUrl = storageUrlToPublicImageUrl(data.publicUrl);
    urls.push(publicUrl);

    // Ghi metadata vào user_media
    try {
      if (user) {
        await supabase.from('user_media').insert({
          user_id: user.id,
          url: publicUrl,
          filename: file.name,
          folder,
          mime_type: file.type || 'image/jpeg',
          size_bytes: file.size,
        });
      }
    } catch { /* silent */ }
  }

  return urls;
}

// ─── Video Upload (News/Property rich editor, admin-only) ─────────────────────
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_VIDEO_FOLDER = new Set(['news', 'properties']);

// Không hứa phát được codec mà thiết bị không hỗ trợ: danh sách này gồm container phổ
// biến mà HTML5 video có thể nhận, sau đó browser xác nhận thêm bằng loadedmetadata.
export type UploadedVideoExtension = 'mp4' | 'mov' | 'webm' | 'ogv' | 'ogg';
type VideoFormat = { mimes: Set<string>; signature: 'isoBmff' | 'ebml' | 'ogg' };
const VIDEO_FORMATS: Record<UploadedVideoExtension, VideoFormat> = {
  mp4: { mimes: new Set(['video/mp4', 'video/quicktime']), signature: 'isoBmff' },
  mov: { mimes: new Set(['video/quicktime', 'video/mp4']), signature: 'isoBmff' },
  webm: { mimes: new Set(['video/webm']), signature: 'ebml' },
  ogv: { mimes: new Set(['video/ogg']), signature: 'ogg' },
  ogg: { mimes: new Set(['video/ogg']), signature: 'ogg' },
};

function videoExtension(name: string): UploadedVideoExtension | null {
  const extension = (name.split('.').pop() || '').toLowerCase();
  return extension in VIDEO_FORMATS ? extension as UploadedVideoExtension : null;
}

export function assertSafeVideoMetadata(file: Pick<File, 'name' | 'type' | 'size'>): UploadedVideoExtension {
  const extension = videoExtension(file.name);
  if (!extension || !VIDEO_FORMATS[extension].mimes.has(file.type)) {
    throw new Error('Chỉ chấp nhận video MP4, MOV, WebM hoặc OGV/OGG với định dạng tệp hợp lệ.');
  }
  if (!file.size) throw new Error('Video trống hoặc không đọc được.');
  if (file.size > MAX_VIDEO_SIZE_BYTES) throw new Error('Video tối đa 50MB. Vui lòng nén hoặc chọn file nhỏ hơn.');
  return extension;
}

export function hasVideoSignature(header: Uint8Array, extension: UploadedVideoExtension): boolean {
  // ISO-BMFF (MP4/MOV): box "ftyp" tại byte 4. WebM: EBML 1A 45 DF A3.
  // Ogg: container OggS. Đây là guard chống đổi đuôi; loadedmetadata là xác nhận cuối.
  if (VIDEO_FORMATS[extension].signature === 'isoBmff') {
    return header.length >= 12 && header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70;
  }
  if (VIDEO_FORMATS[extension].signature === 'ebml') return header.length >= 4 && header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;
  return header.length >= 4 && header[0] === 0x4f && header[1] === 0x67 && header[2] === 0x67 && header[3] === 0x53;
}

// Giữ export cũ cho test/caller hiện tại; MP4 vẫn là ISO-BMFF.
export function hasMp4Signature(header: Uint8Array): boolean {
  return hasVideoSignature(header, 'mp4');
}

export async function assertSafeVideo(file: File): Promise<UploadedVideoExtension> {
  const extension = assertSafeVideoMetadata(file);
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (!hasVideoSignature(header, extension)) {
    throw new Error('Tệp không khớp với định dạng video đã chọn. Vui lòng xuất lại video trước khi tải lên.');
  }
  return extension;
}

function videoFilename(file: File, folder: 'news' | 'properties', extension: UploadedVideoExtension, caption?: string): string {
  const base = buildSlug(caption?.trim() || file.name.replace(/\.[^.]+$/, '') || 'video');
  const nonce = crypto.randomUUID?.().replace(/-/g, '').slice(0, 12) ?? Math.random().toString(36).slice(2, 14);
  return `videos/${folder}/${base || 'video'}-${nonce}.${extension}`;
}

export async function uploadVideo(
  file: File,
  folder: 'news' | 'properties',
  isAdmin = false,
  caption?: string,
): Promise<string> {
  if (!isAdmin || !ALLOWED_VIDEO_FOLDER.has(folder)) {
    throw new Error('Bạn không có quyền tải video ở vị trí này.');
  }
  const extension = await assertSafeVideo(file);
  const filename = videoFilename(file, folder, extension, caption);
  const { error } = await supabase.storage.from('public-media').upload(filename, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: '31536000',
  });
  if (error) throw error;
  const { data } = supabase.storage.from('public-media').getPublicUrl(filename);
  return data.publicUrl;
}

// ─── Document Upload (tài liệu đào tạo AI, admin-only) ──────────────────────────
// Tài liệu KHÔNG phải ảnh nên không dùng assertSafeImage. Whitelist riêng docx/xlsx/
// pdf/text. File gốc chỉ lưu để admin tải lại/đối chiếu; nội dung dùng cho AI là
// extracted_text (trích ở client, xem documentParse.ts) — file gốc không render public.
const ALLOWED_DOC_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc (một số trình gửi MIME này)
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls / .csv đôi khi
  'application/pdf',
  'text/plain', 'text/markdown', 'text/csv',
]);
const ALLOWED_DOC_EXT = new Set(['docx', 'doc', 'xlsx', 'xls', 'pdf', 'txt', 'md', 'csv']);

function assertSafeDocument(file: File) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  // MIME của file tài liệu hay bị trình duyệt để trống → chấp nhận nếu đuôi hợp lệ.
  const extOk = ALLOWED_DOC_EXT.has(ext);
  const mimeOk = file.type === '' || ALLOWED_DOC_MIME.has(file.type);
  if (!extOk || !mimeOk) {
    throw new Error(`Định dạng "${file.type || ext || 'không rõ'}" không được phép. ` +
      `Chỉ chấp nhận Word (.docx), Excel (.xlsx), PDF, hoặc văn bản (.txt, .md, .csv).`);
  }
}

export interface UploadedDocument {
  path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

// Upload file tài liệu gốc vào bucket private admin-uploads. Chỉ lưu object path;
// URL truy cập phải được ký theo phiên owner tại thời điểm mở file.
export async function uploadDocument(file: File, isAdmin = true): Promise<UploadedDocument> {
  assertSafeDocument(file);
  const maxSize = await getMaxFileSize();
  const maxSizeBytes = maxSize * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new Error(`File vượt quá dung lượng cho phép (${maxSize}MB). Vui lòng chọn file nhỏ hơn.`);
  }

  const bucketName = isAdmin ? 'admin-uploads' : 'user-uploads';
  const filename = seoFilename(file, 'ai-docs');
  const { error } = await supabase.storage.from(bucketName).upload(filename, file, { upsert: false });
  if (error) throw error;

  return {
    path: filename,
    file_name: file.name,
    mime_type: file.type || '',
    size_bytes: file.size,
  };
}

// ─── User Favorites (cho người dùng đăng nhập) ──────────────────────────────────
export async function getUserFavoriteIds(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from('user_favorites').select('property_id').eq('user_id', user.id);
  return (data ?? []).map((r: { property_id: string }) => r.property_id);
}

export async function getUserFavorites(): Promise<UserFavorite[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('user_favorites')
    .select('*, properties(*, areas(id,name,slug), property_types(id,name,slug))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  return (data ?? []) as UserFavorite[];
}

export async function toggleUserFavorite(propertyId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Bạn cần đăng nhập để lưu BĐS yêu thích');

  const { data: existing } = await supabase
    .from('user_favorites')
    .select('id')
    .eq('user_id', user.id)
    .eq('property_id', propertyId)
    .maybeSingle();

  if (existing) {
    await supabase.from('user_favorites').delete()
      .eq('user_id', user.id)
      .eq('property_id', propertyId);
    return false;
  }
  await supabase.from('user_favorites').insert({
    user_id: user.id,
    property_id: propertyId
  });
  return true;
}

// ─── Property Favorites (cho guest/session storage) ─────────────────────────────────
export async function getFavoriteIds(): Promise<string[]> {
  const { data } = await supabase.from('property_favorites').select('property_id');
  return (data ?? []).map((r: { property_id: string }) => r.property_id);
}

export async function getFavoriteProperties(): Promise<Property[]> {
  const { data } = await supabase
    .from('property_favorites')
    .select('properties(*, areas(id,name,slug), property_types(id,name,slug))')
    .order('created_at', { ascending: false });
  return ((data ?? []) as unknown as PropertyFavorite[]).map(r => r.properties).filter((p): p is Property => p != null);
}

export async function toggleFavorite(propertyId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('property_favorites').select('id').eq('property_id', propertyId).maybeSingle();
  if (existing) {
    await supabase.from('property_favorites').delete().eq('property_id', propertyId);
    return false;
  }
  await supabase.from('property_favorites').insert({ property_id: propertyId });
  return true;
}

// ─── User Media Library ──────────────────────────────────────────────────────
// Liệt kê ảnh user đã upload. Admin thấy tất cả, user thường chỉ thấy của mình.
export async function getUserMedia(folder?: string): Promise<UserMedia[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let q = supabase
    .from('user_media')
    .select('*')
    .order('created_at', { ascending: false });

  // Kiểm tra role: admin thấy tất cả, user chỉ thấy của mình
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin = (profile as { role: string } | null)?.role === 'admin';
  if (!isAdmin) q = q.eq('user_id', user.id);
  if (folder) q = q.eq('folder', folder);

  const { data } = await q;
  return (data ?? []) as UserMedia[];
}

// Danh mục ảnh chuẩn của hệ thống — luôn hiển thị trong thư viện dù chưa có ảnh nào.
// Khớp với các folder cố định truyền vào ImageUpload/ImageLibraryModal khắp app.
export const KNOWN_MEDIA_FOLDERS = ['properties', 'news', 'user-listings'];

// Liệt kê các thư mục ảnh (giá trị folder phân biệt). Admin thấy mọi thư mục, user
// thường chỉ thấy của mình. Thư mục là nhãn chuỗi trên user_media — "tạo thư mục" chỉ
// là chọn nhãn mới để upload vào, thư mục hiện diện khi có ảnh đầu tiên.
export async function listMediaFolders(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = (profile as { role: string } | null)?.role === 'admin';
  let q = supabase.from('user_media').select('folder');
  if (!isAdmin) q = q.eq('user_id', user.id);
  const { data } = await q;
  // Luôn kèm danh mục chuẩn (dù chưa có ảnh) + gộp thư mục tự tạo có ảnh.
  const set = new Set<string>(KNOWN_MEDIA_FOLDERS);
  for (const row of (data ?? []) as { folder: string | null }[]) {
    if (row.folder?.trim()) set.add(row.folder.trim());
  }
  return Array.from(set).sort();
}

// Xóa ảnh khỏi storage + xóa record metadata
export async function deleteUserMedia(id: string): Promise<void> {
  const { data: media, error: fetchErr } = await supabase
    .from('user_media')
    .select('url, user_id')
    .eq('id', id)
    .single();
  if (fetchErr || !media) throw new Error('Media not found');

  const storage = publicImageUrlToStoragePath((media as { url: string }).url);
  if (storage) {
    try { await supabase.storage.from(storage.bucket).remove([storage.path]); } catch { /* silent */ }
  }

  // Xóa record trong database
  const { error } = await supabase.from('user_media').delete().eq('id', id);
  if (error) throw error;
}

// Tính dung lượng đã dùng / tổng quota (mặc định 50MB)
export async function getUserMediaUsage(): Promise<{ used: number; total: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { used: 0, total: 0 };

  const { data } = await supabase
    .from('user_media')
    .select('size_bytes')
    .eq('user_id', user.id);

  const used = (data ?? []).reduce((sum, m) => sum + (m.size_bytes ?? 0), 0);
  const total = 50 * 1024 * 1024; // 50MB mặc định
  return { used, total };
}
