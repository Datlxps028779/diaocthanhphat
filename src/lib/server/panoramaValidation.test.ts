import { describe, expect, it } from 'vitest';
import { inspectPanoramaBytes } from './panoramaValidation';

function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function webp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
  bytes[24] = (width - 1) & 0xff;
  bytes[25] = ((width - 1) >> 8) & 0xff;
  bytes[26] = ((width - 1) >> 16) & 0xff;
  bytes[27] = (height - 1) & 0xff;
  bytes[28] = ((height - 1) >> 8) & 0xff;
  bytes[29] = ((height - 1) >> 16) & 0xff;
  return bytes;
}

describe('server panorama validation', () => {
  it('derives JPEG dimensions from bytes, not client metadata', () => {
    expect(inspectPanoramaBytes(jpeg(4000, 2000), 'room.jpg', 'image/jpeg')).toMatchObject({
      format: 'jpeg', width: 4000, height: 2000, size_bytes: 23,
    });
  });

  it('derives WEBP dimensions from bytes', () => {
    expect(inspectPanoramaBytes(webp(4000, 2000), 'room.webp', 'image/webp')).toMatchObject({
      format: 'webp', width: 4000, height: 2000,
    });
  });

  it.each([
    ['room.jpg', 'image/jpeg', new Uint8Array([1, 2, 3])],
    ['room.jpg', 'image/webp', jpeg(4000, 2000)],
    ['room.webp', 'image/webp', jpeg(4000, 2000)],
  ])('rejects spoofed format or signature', (name, mime, bytes) => {
    expect(() => inspectPanoramaBytes(bytes, name, mime)).toThrow();
  });

  it('rejects dimensions outside the equirectangular policy', () => {
    expect(() => inspectPanoramaBytes(jpeg(3000, 1000), 'room.jpg', 'image/jpeg')).toThrow();
  });
});
