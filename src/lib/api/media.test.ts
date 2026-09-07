import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertSafePanoramaMetadata,
  assertSafeVideoMetadata,
  hasMp4Signature,
  hasVideoSignature,
  inspectPanorama360,
  MAX_PANORAMA_SIZE_BYTES,
  MAX_PANORAMA_HEIGHT,
  MAX_PANORAMA_WIDTH,
  MIN_PANORAMA_HEIGHT,
  MIN_PANORAMA_WIDTH,
  propertyPanoramaUrl,
  uploadPanoramaObject,
  validatePanoramaDimensions,
  MAX_VIDEO_SIZE_BYTES,
} from './media';
import { supabase } from '../supabase';

describe('video upload guards', () => {
  it('accepts only non-empty MP4 metadata inside the 50MB limit', () => {
    expect(() => assertSafeVideoMetadata({ name: 'tour.mp4', type: 'video/mp4', size: MAX_VIDEO_SIZE_BYTES })).not.toThrow();
  });

  it.each([
    { name: 'tour.exe', type: 'application/octet-stream', size: 100 },
    { name: 'tour.mp4', type: 'application/octet-stream', size: 100 },
    { name: 'tour.mp4', type: 'video/mp4', size: 0 },
    { name: 'tour.mp4', type: 'video/mp4', size: MAX_VIDEO_SIZE_BYTES + 1 },
  ])('rejects unsupported or unsafe video metadata', file => {
    expect(() => assertSafeVideoMetadata(file)).toThrow();
  });

  it('requires a container signature rather than trusting the filename', () => {
    expect(hasMp4Signature(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]))).toBe(true);
    expect(hasVideoSignature(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x93]), 'webm')).toBe(true);
    expect(hasVideoSignature(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00]), 'ogv')).toBe(true);
    expect(hasMp4Signature(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]))).toBe(false);
  });
});

describe('panorama upload guards', () => {
  it('accepts matching JPEG and WEBP metadata within the 30MB limit', () => {
    expect(() => assertSafePanoramaMetadata({ name: 'room.jpg', type: 'image/jpeg', size: MAX_PANORAMA_SIZE_BYTES })).not.toThrow();
    expect(() => assertSafePanoramaMetadata({ name: 'room.webp', type: 'image/webp', size: 1 })).not.toThrow();
  });

  it.each([
    { name: 'room.png', type: 'image/png', size: 100 },
    { name: 'room.jpg', type: 'image/webp', size: 100 },
    { name: 'room.jpg', type: 'image/jpeg', size: 0 },
    { name: 'room.webp', type: 'image/webp', size: MAX_PANORAMA_SIZE_BYTES + 1 },
  ])('rejects unsupported or unsafe panorama metadata', file => {
    expect(() => assertSafePanoramaMetadata(file)).toThrow();
  });

  it('accepts equirectangular dimensions and rejects invalid geometry', () => {
    expect(() => validatePanoramaDimensions(MIN_PANORAMA_WIDTH, MIN_PANORAMA_HEIGHT)).not.toThrow();
    expect(() => validatePanoramaDimensions(MAX_PANORAMA_WIDTH, MAX_PANORAMA_HEIGHT)).not.toThrow();
    expect(() => validatePanoramaDimensions(1600, 800)).toThrow();
    expect(() => validatePanoramaDimensions(4000, 1000)).toThrow();
  });
});

describe('panorama inspection and object upload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('builds a same-site encoded proxy URL', () => {
    expect(propertyPanoramaUrl('property-id/room one.jpg')).toBe('/hinh-anh/property-360/property-id/room%20one.jpg');
  });

  it('reads real dimensions before marking a panorama uploadable', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 2000, close }));
    const file = new File([new Uint8Array([1])], 'living-room.jpg', { type: 'image/jpeg' });

    await expect(inspectPanorama360(file)).resolves.toMatchObject({
      format: 'jpeg', mime_type: 'image/jpeg', size_bytes: 1, width: 4000, height: 2000,
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects a valid MIME file whose actual geometry is not equirectangular', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 3000, height: 1000, close: vi.fn() }));
    const file = new File([new Uint8Array([1])], 'wrong-shape.jpg', { type: 'image/jpeg' });

    await expect(inspectPanorama360(file)).rejects.toThrow('tỷ lệ gần 2:1');
  });

  it('uploads only after admin authorization and stores a UUID path under the property', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    vi.spyOn(supabase.storage, 'from').mockReturnValue({ upload } as never);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 2000, close: vi.fn() }));
    const propertyId = '123e4567-e89b-12d3-a456-426614174000';
    const file = new File([new Uint8Array([1])], 'living-room.webp', { type: 'image/webp' });

    const uploaded = await uploadPanoramaObject(file, propertyId, true);

    expect(uploaded).toMatchObject({ format: 'webp', width: 4000, height: 2000, original_filename: 'living-room.webp' });
    expect(uploaded.storage_path).toMatch(new RegExp(`^${propertyId}/[0-9a-f-]{36}\\.webp$`));
    expect(upload).toHaveBeenCalledWith(uploaded.storage_path, file, expect.objectContaining({ contentType: 'image/webp', upsert: false }));
  });
});
