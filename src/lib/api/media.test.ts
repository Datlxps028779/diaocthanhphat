import { describe, expect, it } from 'vitest';
import { assertSafeVideoMetadata, hasMp4Signature, hasVideoSignature, MAX_VIDEO_SIZE_BYTES } from './media';

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

  it.each([
    { name: 'clip.mov', type: 'video/quicktime', size: 100 },
    { name: 'clip.webm', type: 'video/webm', size: 100 },
    { name: 'clip.ogv', type: 'video/ogg', size: 100 },
  ])('accepts supported video containers: $name', file => {
    expect(() => assertSafeVideoMetadata(file)).not.toThrow();
  });
});
