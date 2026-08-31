export const SITE_IDENTITY = {
  name: 'Chợ Nhà Việt',
  shortName: 'Chợ Nhà Việt',
  description: 'Nền tảng bất động sản minh bạch, kết nối người mua, người thuê và chủ nhà.',
} as const;

export function normalizeSiteBrandText(value: string): string {
  return value.replace(/\bBĐS\s+Bình Dương\b/gi, SITE_IDENTITY.name).trim();
}
