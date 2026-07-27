// Nén ảnh Ở CLIENT bằng Canvas thuần — KHÔNG phụ thuộc bên thứ 3. Mục tiêu: ảnh OG
// share (Zalo/FB) < ~1MB. Zalo bỏ qua thumbnail nếu ảnh > ~1MB, nên ảnh nội dung nặng
// (PNG chụp 2MB+) share không hiện ảnh. Nén giảm cạnh ≤ 1600px + xuất JPEG q0.82.
// Logic quyết định tách riêng (thuần, test được) khỏi phần canvas (chỉ chạy browser).

// Cạnh dài tối đa sau nén — đủ nét cho OG 1200×630 và hiển thị web, mà nhẹ.
export const MAX_EDGE = 1600;
// Ngưỡng cân nhắc nén: ảnh nhẹ hơn mức này và không quá khổ thì để nguyên.
export const COMPRESS_SIZE_THRESHOLD = 500 * 1024; // 500KB
export const JPEG_QUALITY = 0.82;

const RASTER_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Quyết định có nén không (thuần). Nén khi là raster hỗ trợ VÀ (nặng hơn ngưỡng HOẶC
// cạnh dài vượt MAX_EDGE). GIF/SVG/định dạng khác → không nén (giữ nguyên/animation).
export function shouldCompress(input: { mime: string; sizeBytes: number; width?: number; height?: number }): boolean {
  if (!RASTER_MIME.has(input.mime)) return false;
  const oversized = input.sizeBytes > COMPRESS_SIZE_THRESHOLD;
  const tooWide = (input.width ?? 0) > MAX_EDGE || (input.height ?? 0) > MAX_EDGE;
  return oversized || tooWide;
}

// Chọn định dạng xuất (thuần). PNG có kênh alpha (nền trong suốt: logo/icon) → giữ PNG
// để không mất nền. Còn lại (ảnh chụp, JPG, PNG đặc) → JPEG cho nhẹ.
export function pickOutputFormat(input: { mime: string; hasAlpha: boolean }): 'image/jpeg' | 'image/png' {
  if (input.mime === 'image/png' && input.hasAlpha) return 'image/png';
  return 'image/jpeg';
}

// Tính kích thước đích giữ tỉ lệ, cạnh dài ≤ MAX_EDGE (thuần). Không phóng to ảnh nhỏ.
export function fitWithinMaxEdge(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Đổi đuôi tên file theo định dạng xuất thật (PNG→JPG khi nén sang jpeg).
export function renameForFormat(fileName: string, format: 'image/jpeg' | 'image/png'): string {
  const ext = format === 'image/png' ? 'png' : 'jpg';
  return fileName.replace(/\.[^.]+$/, '') + '.' + ext;
}

// Đọc pixel để phát hiện có alpha < 255 không (nền trong suốt). Chỉ gọi cho PNG.
function canvasHasAlpha(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
  } catch { /* getImageData có thể taint nếu ảnh khác origin — coi như không alpha */ }
  return false;
}

function loadBitmap(file: Blob): Promise<{ bmp: ImageBitmap | HTMLImageElement; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).then(bmp => ({ bmp, width: bmp.width, height: bmp.height }));
  }
  // Fallback môi trường không có createImageBitmap: dùng <img> + object URL.
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ bmp: img, width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

// Nén 1 ảnh trong browser. Trả File mới (đã resize/đổi format) nếu nhỏ hơn bản gốc;
// ngược lại (không đáng nén, lỗi, hoặc blob to hơn) trả nguyên file gốc — KHÔNG làm to thêm.
export async function compressImage(file: File): Promise<File> {
  // Quyết định nén dựa trên kích thước THẬT (đọc được sau khi load bitmap): ảnh nhẹ
  // nhưng cực rộng vẫn cần resize, ảnh nặng cần nén. shouldCompress ở tầng gọi chỉ
  // lọc sơ theo mime/size; ở đây kiểm cả cạnh (needByEdge) lẫn dung lượng (needBySize).
  if (!RASTER_MIME.has(file.type)) return file;
  if (typeof document === 'undefined') return file; // SSR guard

  try {
    const { bmp, width, height } = await loadBitmap(file);
    const target = fitWithinMaxEdge(width, height);
    const needByEdge = target.width !== width || target.height !== height;
    const needBySize = file.size > COMPRESS_SIZE_THRESHOLD;
    if (!needByEdge && !needBySize) {
      if ('close' in bmp && typeof bmp.close === 'function') bmp.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp as CanvasImageSource, 0, 0, target.width, target.height);
    if ('close' in bmp && typeof bmp.close === 'function') bmp.close();

    const hasAlpha = file.type === 'image/png' && canvasHasAlpha(ctx, target.width, target.height);
    const format = pickOutputFormat({ mime: file.type, hasAlpha });

    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b), format, format === 'image/jpeg' ? JPEG_QUALITY : undefined),
    );
    if (!blob || blob.size >= file.size) return file; // không nhỏ hơn → giữ gốc

    return new File([blob], renameForFormat(file.name, format), { type: format });
  } catch {
    return file; // mọi lỗi → giữ file gốc, không chặn upload
  }
}
