import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('shared map activation contract', () => {
  it('wraps public listing, detail and location-picker maps with MapInteractionGate', () => {
    expect(read('src/components/PropertyMap.tsx')).toContain('<MapInteractionGate label="bản đồ bất động sản"');
    expect(read('src/screens/PropertyDetailPage.tsx')).toContain('<MapInteractionGate label="bản đồ vị trí bất động sản"');
    expect(read('src/components/LocationPicker.tsx')).toContain('<MapInteractionGate label="bản đồ chọn vị trí"');
  });
});
