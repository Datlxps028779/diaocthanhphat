import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const footer = readFileSync(resolve(process.cwd(), 'src/components/ReferenceFooter.tsx'), 'utf8');
const siteChrome = readFileSync(resolve(process.cwd(), 'src/components/SiteChrome.tsx'), 'utf8');
const landing = readFileSync(resolve(process.cwd(), 'src/LandingPage.tsx'), 'utf8');

describe('reference footer coverage', () => {
  it('is shared by content pages and the landing page', () => {
    expect(siteChrome).toContain('<ReferenceFooter');
    expect(landing).toContain('<ReferenceFooter');
  });

  it('keeps the reference information architecture with real system links', () => {
    expect(footer).toContain('Liên kết nhanh');
    expect(footer).toContain('Nhận thông tin mới nhất');
    expect(footer).toContain('Khám phá bất động sản');
    expect(footer).toContain('/trang/chinh-sach-bao-mat');
    expect(footer).toContain('/trang/dieu-khoan-su-dung');
    expect(footer).toContain('https://online.gov.vn/nen-tang/d6e6a45b-9623-4eb2-bfb5-27247f25dd91');
    expect(footer).toContain('DaThongBao.png');
  });

  it('does not fabricate strategic partners or business registration data', () => {
    expect(footer).not.toContain('VINHOMES');
    expect(footer).not.toContain('NOVALAND');
    expect(footer).toContain('hasRealLicense');
  });
});
