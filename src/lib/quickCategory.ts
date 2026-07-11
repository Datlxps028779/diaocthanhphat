import type { Page } from './router';

// Cấu hình bộ lọc của 1 ô "Danh mục nhanh" trên trang chủ. Mọi chiều đều tùy chọn:
// ô nào để trống chiều nào thì bỏ qua chiều đó (admin tự quyết dùng chiều nào).
export interface CategoryFilterConfig {
  listingType?: 'mua_ban' | 'cho_thue' | '';
  typeId?: string;
  district?: string;
  legal?: string;
}

// Dựng Page listings từ cấu hình 1 ô. Chỉ đưa vào Page các chiều có giá trị thật
// (bỏ chuỗi rỗng) để href/parse không sinh query thừa.
export function quickCategoryToPage(cfg: CategoryFilterConfig): Page {
  const page: Extract<Page, { name: 'listings' }> = { name: 'listings' };
  if (cfg.listingType) page.listingType = cfg.listingType;
  if (cfg.typeId) page.typeId = cfg.typeId;
  if (cfg.district) page.district = cfg.district;
  if (cfg.legal) page.legal = cfg.legal;
  return page;
}
