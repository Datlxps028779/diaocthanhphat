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

  it('never calls fitBounds with an empty marker collection', () => {
    const source = read('src/components/PropertyMap.tsx');
    expect(source).toContain("isValidTaxonomyBounds(selectedGeo?.bounds) && (!focusAll || points.length === 0)");
    expect(source).toContain('else if (points.length > 1) map.fitBounds(L.latLngBounds(points)');
    expect(source).toContain('else complete();');
    expect(source).not.toContain('else map.fitBounds(L.latLngBounds(points)');
  });
});
