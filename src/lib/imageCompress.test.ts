import { describe, it, expect } from 'vitest';
import {
  shouldCompress,
  pickOutputFormat,
  fitWithinMaxEdge,
  renameForFormat,
  MAX_EDGE,
  COMPRESS_SIZE_THRESHOLD,
} from './imageCompress';

describe('shouldCompress', () => {
  it('ảnh raster nhẹ + đúng khổ → không nén', () => {
    expect(shouldCompress({ mime: 'image/jpeg', sizeBytes: 100 * 1024, width: 800, height: 600 })).toBe(false);
  });

  it('ảnh raster nặng hơn ngưỡng → nén', () => {
    expect(shouldCompress({ mime: 'image/png', sizeBytes: COMPRESS_SIZE_THRESHOLD + 1 })).toBe(true);
  });

  it('ảnh nhẹ nhưng cạnh vượt MAX_EDGE → nén (resize)', () => {
    expect(shouldCompress({ mime: 'image/jpeg', sizeBytes: 10 * 1024, width: MAX_EDGE + 1, height: 900 })).toBe(true);
  });

  it('GIF → không nén (giữ animation)', () => {
    expect(shouldCompress({ mime: 'image/gif', sizeBytes: 5 * 1024 * 1024, width: 4000, height: 4000 })).toBe(false);
  });

  it('SVG/định dạng khác → không nén', () => {
    expect(shouldCompress({ mime: 'image/svg+xml', sizeBytes: 5 * 1024 * 1024 })).toBe(false);
  });
});

describe('pickOutputFormat', () => {
  it('PNG có alpha → giữ PNG (không mất nền trong suốt)', () => {
    expect(pickOutputFormat({ mime: 'image/png', hasAlpha: true })).toBe('image/png');
  });

  it('PNG không alpha → JPEG cho nhẹ', () => {
    expect(pickOutputFormat({ mime: 'image/png', hasAlpha: false })).toBe('image/jpeg');
  });

  it('JPG → JPEG', () => {
    expect(pickOutputFormat({ mime: 'image/jpeg', hasAlpha: false })).toBe('image/jpeg');
  });

  it('WebP → JPEG', () => {
    expect(pickOutputFormat({ mime: 'image/webp', hasAlpha: false })).toBe('image/jpeg');
  });
});

describe('fitWithinMaxEdge', () => {
  it('ảnh nhỏ hơn MAX_EDGE → giữ nguyên (không phóng to)', () => {
    expect(fitWithinMaxEdge(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('cạnh ngang vượt → co theo tỉ lệ, cạnh dài = MAX_EDGE', () => {
    expect(fitWithinMaxEdge(3200, 1600)).toEqual({ width: MAX_EDGE, height: 800 });
  });

  it('cạnh dọc vượt → co theo tỉ lệ', () => {
    expect(fitWithinMaxEdge(800, 3200)).toEqual({ width: 400, height: MAX_EDGE });
  });
});

describe('renameForFormat', () => {
  it('PNG→JPG đổi đuôi', () => {
    expect(renameForFormat('anh-nha.png', 'image/jpeg')).toBe('anh-nha.jpg');
  });

  it('giữ PNG', () => {
    expect(renameForFormat('logo.png', 'image/png')).toBe('logo.png');
  });

  it('không có đuôi → thêm đuôi', () => {
    expect(renameForFormat('anh', 'image/jpeg')).toBe('anh.jpg');
  });
});
