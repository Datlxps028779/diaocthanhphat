export { SITE_IDENTITY } from './siteIdentity';
import { SITE_IDENTITY } from './siteIdentity';

export const SITE_BRAND_DEFAULTS = {
  site_logo_text: SITE_IDENTITY.name,
  site_logo_sub: 'Nền tảng bất động sản uy tín',
  footer_description: 'Nền tảng bất động sản minh bạch, kết nối người mua, người thuê và chủ nhà.',
  seo_block_tagline: 'Tìm kiếm và đăng tin bất động sản với thông tin rõ ràng, vị trí xác thực và dữ liệu thực tế.',
} as const;

export function settingFallback(key: string, fallback = ''): string {
  if (key in SITE_BRAND_DEFAULTS) return SITE_BRAND_DEFAULTS[key as keyof typeof SITE_BRAND_DEFAULTS];
  return fallback;
}
