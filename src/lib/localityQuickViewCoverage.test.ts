import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const listings = readFileSync(resolve(process.cwd(), 'src/screens/ListingsPage.tsx'), 'utf8');
const drawer = readFileSync(resolve(process.cwd(), 'src/components/property/PropertyQuickViewDrawer.tsx'), 'utf8');

describe('locality property quick view', () => {
  it('opens the drawer only for unmodified desktop clicks inside a locality scope', () => {
    expect(listings).toContain("window.matchMedia('(min-width: 1024px)').matches");
    expect(listings).toContain('if (!localityScope || event.defaultPrevented');
    expect(listings).toContain('event.preventDefault();');
    expect(listings).toContain('setQuickViewProperty(property);');
  });

  it('wires selected locality cards to the quick-view handler', () => {
    expect(listings).toContain("onResultClick={resultClickHandler(property, index + 1, 'list')}");
    expect(listings).toContain('<PropertyQuickViewDrawer');
  });

  it('keeps a full detail link and accessible close behavior in the drawer', () => {
    expect(drawer).toContain('role="dialog"');
    expect(drawer).toContain("event.key === 'Escape'");
    expect(drawer).toContain('buildProductPath(property)');
    expect(drawer).toContain('Chi tiết bất động sản');
  });
});
