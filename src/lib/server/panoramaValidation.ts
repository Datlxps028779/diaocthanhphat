const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_PANORAMA_SIZE_BYTES = 30 * 1024 * 1024;
export const MIN_PANORAMA_WIDTH = 2000;
export const MIN_PANORAMA_HEIGHT = 1000;
export const MAX_PANORAMA_WIDTH = 16000;
export const MAX_PANORAMA_HEIGHT = 8000;

export type PanoramaFormat = 'jpeg' | 'webp';
export type PanoramaServerInspection = {
  format: PanoramaFormat;
  mime_type: 'image/jpeg' | 'image/webp';
  size_bytes: number;
  width: number;
  height: number;
};

function readU16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 1 >= bytes.length) return null;
    const length = readU16BE(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return null;
    const isFrame = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (isFrame && length >= 7) {
      const height = readU16BE(bytes, offset + 3);
      const width = readU16BE(bytes, offset + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 16 || bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46
    || bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = readU24LE(bytes, 24) + 1;
    const height = readU24LE(bytes, 27) + 1;
    return { width, height };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    for (let offset = 20; offset + 9 < bytes.length; offset += 1) {
      if (bytes[offset] === 0x9d && bytes[offset + 1] === 0x01 && bytes[offset + 2] === 0x2a) {
        return { width: bytes[offset + 3] | ((bytes[offset + 4] & 0x3f) << 8), height: bytes[offset + 5] | ((bytes[offset + 6] & 0x3f) << 8) };
      }
    }
  }
  return null;
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || width < MIN_PANORAMA_WIDTH || height < MIN_PANORAMA_HEIGHT
    || width > MAX_PANORAMA_WIDTH || height > MAX_PANORAMA_HEIGHT
    || width / height < 1.8 || width / height > 2.2) {
    throw new Error('Ảnh 360 có kích thước hoặc tỷ lệ equirectangular không hợp lệ.');
  }
}

export function inspectPanoramaBytes(
  bytes: Uint8Array,
  filename: string,
  declaredMime: string,
): PanoramaServerInspection {
  const extension = filename.split('.').pop()?.toLowerCase();
  const format: PanoramaFormat | null = extension === 'jpg' || extension === 'jpeg'
    ? 'jpeg' : extension === 'webp' ? 'webp' : null;
  if (!format || declaredMime !== `image/${format === 'jpeg' ? 'jpeg' : 'webp'}`) {
    throw new Error('Chỉ chấp nhận ảnh 360 JPG/JPEG hoặc WEBP với MIME khớp phần mở rộng.');
  }
  if (bytes.length === 0 || bytes.length > MAX_PANORAMA_SIZE_BYTES) {
    throw new Error('Ảnh 360 phải có dung lượng từ 1 byte đến tối đa 30MB.');
  }
  const dimensions = format === 'jpeg' ? jpegDimensions(bytes) : webpDimensions(bytes);
  if (!dimensions) throw new Error('Bytes ảnh không khớp với định dạng JPG/WEBP hợp lệ.');
  validateDimensions(dimensions.width, dimensions.height);
  return {
    format,
    mime_type: format === 'jpeg' ? 'image/jpeg' : 'image/webp',
    size_bytes: bytes.length,
    ...dimensions,
  };
}

export function assertPanoramaUuid(value: string, field: string): void {
  if (!UUID_RE.test(value)) throw new Error(`${field} không hợp lệ.`);
}
