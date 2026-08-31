export function buildTruthfulHeroSubtitle(configured: string | null | undefined, activeListingCount: number | null | undefined): string {
  const fallback = activeListingCount != null
    ? `${activeListingCount.toLocaleString('vi-VN')} tin đăng nhà đất đang hoạt động tại Bình Dương, Bình Phước, Đồng Nai`
    : 'Tin đăng nhà đất, căn hộ, đất nền tại Bình Dương, Bình Phước, Đồng Nai';
  const value = configured?.trim() ?? '';
  if (!value || /(?:hơn\s*)?5[.,]?\s*000|hàng\s+nghìn|hàng\s+ngàn/i.test(value)) return fallback;
  return value;
}
