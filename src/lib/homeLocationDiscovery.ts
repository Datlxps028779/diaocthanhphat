export type LocationArea = { id: string; name: string; slug: string };
export type HomeLocationItem = { id: string; area_id: string; image_url: string; subtitle: string; enabled: boolean };
export const MAX_HOME_LOCATIONS = 12;
const LEGACY_SLUGS = ['binh-duong', 'binh-phuoc', 'dong-nai'];

function validImage(value: string): boolean {
  if (!value) return true;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

export function validateLocationItems(items: HomeLocationItem[], areas: LocationArea[]): string[] {
  const issues: string[] = [];
  if (items.length > MAX_HOME_LOCATIONS) issues.push(`Tối đa ${MAX_HOME_LOCATIONS} tỉnh.`);
  const ids = new Set<string>();
  const areaIds = new Set<string>();
  for (const item of items) {
    if (!item.id || ids.has(item.id)) issues.push('Mã thẻ bị thiếu hoặc trùng.');
    if (!areas.some(area => area.id === item.area_id)) issues.push('Vui lòng chọn tỉnh đang có trong hệ thống.');
    if (areaIds.has(item.area_id)) issues.push('Mỗi tỉnh chỉ xuất hiện một lần.');
    if (item.subtitle.length > 200) issues.push('Mô tả tối đa 200 ký tự.');
    if (item.image_url.length > 2048 || !validImage(item.image_url)) issues.push('Ảnh phải là URL HTTPS hoặc đường dẫn nội bộ hợp lệ.');
    ids.add(item.id);
    areaIds.add(item.area_id);
  }
  return [...new Set(issues)];
}

function isItem(value: unknown): value is HomeLocationItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.area_id === 'string' && typeof item.image_url === 'string'
    && typeof item.subtitle === 'string' && typeof item.enabled === 'boolean';
}

export function readLocationDiscovery(settings: Record<string, unknown>, areas: LocationArea[]): { items: HomeLocationItem[]; issues: string[] } {
  const items: HomeLocationItem[] = [];
  const issues: string[] = [];
  if ('version' in settings) {
    if (settings.version !== 2 || !Array.isArray(settings.items)) return { items, issues: ['Cấu hình khu vực không hợp lệ hoặc thuộc phiên bản chưa được hỗ trợ.'] };
    if (settings.items.length > MAX_HOME_LOCATIONS) issues.push(`Chỉ hiển thị tối đa ${MAX_HOME_LOCATIONS} tỉnh.`);
    for (const value of settings.items.slice(0, MAX_HOME_LOCATIONS)) {
      if (!isItem(value)) { issues.push('Có thẻ khu vực sai định dạng.'); continue; }
      const errors = validateLocationItems([...items, value], areas);
      if (errors.length) issues.push(...errors);
      else items.push(value);
    }
    return { items, issues: [...new Set(issues)] };
  }
  for (let index = 1; index <= 3; index++) {
    const rawSlug = settings[`region${index}_slug`];
    const rawTitle = settings[`region${index}_title`];
    const slug = typeof rawSlug === 'string' ? rawSlug.trim().replace(/^\/khu-vuc\//, '').replace(/\/$/, '') : '';
    const matches = slug ? areas.filter(area => area.slug === slug)
      : typeof rawTitle === 'string' && rawTitle.trim() ? areas.filter(area => area.name.toLocaleLowerCase('vi-VN') === rawTitle.trim().toLocaleLowerCase('vi-VN'))
      : areas.filter(area => area.slug === LEGACY_SLUGS[index - 1]);
    if (matches.length !== 1 || items.some(item => item.area_id === matches[0].id)) {
      issues.push(`Thẻ cũ #${index} chưa khớp duy nhất với tỉnh trong hệ thống.`);
      continue;
    }
    const image = settings[`region${index}_image`];
    const subtitle = settings[`region${index}_subtitle`];
    items.push({ id: `area-${matches[0].id}`, area_id: matches[0].id, image_url: typeof image === 'string' && validImage(image) ? image : '', subtitle: typeof subtitle === 'string' ? subtitle.slice(0, 200) : '', enabled: true });
  }
  return { items, issues };
}

export function resolveLocationSelection<T extends LocationArea>(selectedId: string, items: HomeLocationItem[], areas: T[]): T | undefined {
  return areas.find(area => area.id === selectedId)
    ?? areas.find(area => area.id === items.find(item => item.enabled && areas.some(area => area.id === item.area_id))?.area_id)
    ?? areas[0];
}

export function saveLocationDiscovery(settings: Record<string, unknown>, items: HomeLocationItem[]): Record<string, unknown> {
  return { ...settings, version: 2, items };
}
