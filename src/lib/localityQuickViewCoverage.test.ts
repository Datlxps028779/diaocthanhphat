import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDescriptionContent } from '../components/property/PropertyQuickViewDrawer';

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

  it('preserves decimal text, masks every phone number, and keeps contact phrases intact', () => {
    const result = buildDescriptionContent('Liên hệ với công viên gần nhà, giá 2.5 tỷ. Liên hệ 0901.234.567 hoặc 0912.345.678 để xem nhà.');
    expect(result.paragraphs.join(' ')).toContain('giá 2.5 tỷ');
    expect(result.paragraphs.join(' ')).toContain('Liên hệ với công viên gần nhà');
    expect(result.paragraphs.join(' ')).not.toMatch(/0901|0912/);
    expect(result.contact?.phone).toBe('0901****');
    expect(result.contact?.note).toContain('0912****');
    const leadingContact = buildDescriptionContent('Liên hệ 0901.234.567 để xem nhà');
    expect(leadingContact.contact?.phone).toBe('0901****');
    expect(buildDescriptionContent('Liên hệ 0901.234.567. Diện tích 100m².').paragraphs.join(' ')).toContain('Diện tích 100m².');
  });

  it('splits source bullets without inventing category labels', () => {
    const result = buildDescriptionContent('Một vị trí tốt. 📍 Đối diện UBND. ✅ Full thổ cư. 💰 Giá 5,8 tỷ. #nhadat #laithieu');
    expect(result.paragraphs).toEqual([
      'Một vị trí tốt.',
      '📍 Đối diện UBND.',
      '✅ Full thổ cư.',
      '💰 Giá 5,8 tỷ.',
      '#nhadat #laithieu',
    ]);
    expect(result.paragraphs).not.toContain('Thông tin');
  });
});
