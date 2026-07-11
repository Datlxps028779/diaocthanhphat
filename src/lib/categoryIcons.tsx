import {
  Home, Building2, MapPin, TrendingUp, Shield, Briefcase,
  Trees, Warehouse, Store, Landmark, Hotel, Tent, Building, Play,
  type LucideIcon,
} from 'lucide-react';

// Bộ icon dùng cho "Danh mục nhanh". Curated (không import * from lucide để giữ
// tree-shaking) — admin chọn theo tên, LandingPage render theo tên. Thêm icon mới
// chỉ cần bổ sung 1 dòng ở đây là cả hai nơi thấy.
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Home, Building2, MapPin, TrendingUp, Shield, Briefcase,
  Trees, Warehouse, Store, Landmark, Hotel, Tent, Building, Play,
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

// Render icon theo tên; tên lạ → fallback Home để không vỡ layout.
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CATEGORY_ICONS[name] ?? Home;
  return <Icon className={className} />;
}
