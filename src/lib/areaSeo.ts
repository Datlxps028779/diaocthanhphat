import type { Metadata } from 'next';
import type { Area, Property } from './supabase';

const SITE_URL = process.env.SITE_URL || 'https://diaocthanhphat.com';
const SITE_NAME = 'BĐS Bình Dương';

export const MIN_AREA_LISTINGS_FOR_INDEX = 5;

export interface AreaDetail {
  heroImage: string;
  description: string;
  infrastructure: string[];
  investmentTypes: string[];
  priceRange: string;
  growthPct: number;
  riskLevel: string;
  highlights: string[];
  centerLat: number;
  centerLng: number;
  zoom: number;
}

export const AREA_DETAILS: Record<string, AreaDetail> = {
  'tp-hcm': {
    heroImage: 'https://images.pexels.com/photos/1103970/pexels-photo-1103970.jpeg?auto=compress&w=800',
    description: 'TP. Hồ Chí Minh là trung tâm kinh tế lớn nhất Việt Nam, thị trường BĐS sôi động, thanh khoản cao nhất cả nước.',
    infrastructure: ['Metro Bến Thành – Suối Tiên (khai thác)', 'Vành đai 3 TP.HCM (đang xây)', 'Cao tốc TP.HCM – Mộc Bài', 'Cầu Thủ Thiêm 3, 4', 'QL50 & QL13 mở rộng'],
    investmentTypes: ['Nhà phố cho thuê', 'Căn hộ cao cấp', 'Shophouse thương mại', 'Đất nền vùng ven'],
    priceRange: '4 – 15 tỷ/căn', growthPct: 15, riskLevel: 'Rất thấp',
    highlights: ['Trung tâm kinh tế lớn nhất VN', 'Thanh khoản cao nhất', 'Hạ tầng đồng bộ'],
    centerLat: 10.82, centerLng: 106.63, zoom: 11,
  },
  'binh-duong': {
    heroImage: 'https://images.pexels.com/photos/1642125/pexels-photo-1642125.jpeg?auto=compress&w=800',
    description: 'Bình Dương là trung tâm công nghiệp năng động, dẫn đầu cả nước về thu hút FDI với hơn 30 khu công nghiệp.',
    infrastructure: ['Cao tốc TP.HCM – Thủ Dầu Một', 'Metro số 1 kéo dài đến Bình Dương', 'KCN VSIP 1, 2, 3', 'QL13 mở rộng 6 làn', 'Vành đai 3 TP.HCM qua Bình Dương'],
    investmentTypes: ['Đất nền khu dân cư', 'Nhà phố thương mại', 'Nhà ở công nhân', 'Shophouse KCN'],
    priceRange: '1,5 – 4,5 tỷ/nền', growthPct: 22, riskLevel: 'Thấp',
    highlights: ['30+ KCN đang hoạt động', 'Dân số tăng nhanh', 'FDI dẫn đầu cả nước'],
    centerLat: 11.07, centerLng: 106.65, zoom: 11,
  },
  'dong-nai': {
    heroImage: 'https://images.pexels.com/photos/2119713/pexels-photo-2119713.jpeg?auto=compress&w=800',
    description: 'Đồng Nai là tâm điểm hạ tầng với Sân bay Long Thành – công trình tỷ đô tạo cú hích tăng giá mạnh nhất khu vực.',
    infrastructure: ['Sân bay Quốc tế Long Thành (2026)', 'Cao tốc Biên Hòa – Vũng Tàu', 'Vành đai 4 TP.HCM', 'Cầu Đồng Nai 2', 'Cao tốc Phan Thiết – Dầu Giây'],
    investmentTypes: ['Đất ven sân bay', 'Đất nền ven sông', 'Nhà phố trung tâm', 'Biệt thự nghỉ dưỡng'],
    priceRange: '1,8 – 6 tỷ/nền', growthPct: 25, riskLevel: 'Thấp',
    highlights: ['Sân bay Long Thành – lớn nhất VN', 'Giá còn thấp so với tiềm năng', 'Hạ tầng bùng nổ'],
    centerLat: 10.96, centerLng: 107.0, zoom: 11,
  },
  'binh-phuoc': {
    heroImage: 'https://images.pexels.com/photos/440731/pexels-photo-440731.jpeg?auto=compress&w=800',
    description: 'Bình Phước nổi lên như vùng đất vàng với quỹ đất rộng lớn, giá còn thấp, hạ tầng đầu tư mạnh.',
    infrastructure: ['Cao tốc Chơn Thành – Đức Hòa (đang xây)', 'Quốc lộ 14 nâng cấp 4 làn', 'KCN Becamex Bình Phước 4.600ha', 'Cửa khẩu quốc tế Hoa Lư', 'Sân bay Đồng Xoài (quy hoạch)'],
    investmentTypes: ['Đất nền giá thấp', 'Đất ven sông Bé', 'Trang trại kết hợp', 'Đất công nghiệp'],
    priceRange: '400tr – 1,8 tỷ/nền', growthPct: 35, riskLevel: 'Trung bình',
    highlights: ['Giá đất thấp nhất vùng', 'Tiềm năng tăng giá 35%+/năm', 'Quỹ đất dồi dào'],
    centerLat: 11.74, centerLng: 106.72, zoom: 10,
  },
};

export function getAreaDetails(slug: string | null | undefined): AreaDetail | null {
  if (!slug) return null;
  return AREA_DETAILS[slug] ?? null;
}

export function areaSummaryFromData(area: Pick<Area, 'name' | 'description'>, detail: Pick<AreaDetail, 'description'> | null): string {
  const dbDescription = area.description?.trim();
  if (dbDescription) return dbDescription;
  const detailDescription = detail?.description?.trim();
  if (detailDescription) return detailDescription;
  return `Thông tin bất động sản tại ${area.name}, bao gồm tin đăng đang hoạt động, khu vực liên quan và các lựa chọn mua bán/cho thuê phù hợp.`;
}

export interface AreaSeoInput {
  area: Pick<Area, 'name' | 'slug'>;
  activeListings: Pick<Property, 'id' | 'district' | 'property_type_id'>[];
  districts: string[];
  propertyTypes: string[];
  hasDescription: boolean;
}

export interface AreaSeoEvaluation {
  indexable: boolean;
  robots: { index: boolean; follow: boolean };
  reasons: string[];
}

export function evaluateAreaSeo(input: AreaSeoInput): AreaSeoEvaluation {
  const reasons: string[] = [];
  if (!input.area.slug?.trim()) reasons.push('missing_slug');
  if (!input.area.name?.trim()) reasons.push('missing_name');
  if (!input.hasDescription) reasons.push('missing_unique_description');
  if (input.activeListings.length < MIN_AREA_LISTINGS_FOR_INDEX) reasons.push('not_enough_active_listings');

  const districtSignals = new Set(input.districts.filter(Boolean));
  const typeSignals = new Set(input.propertyTypes.filter(Boolean));
  const hasDistinctSignals = districtSignals.size >= 2 || typeSignals.size >= 2 || input.activeListings.length >= MIN_AREA_LISTINGS_FOR_INDEX;
  if (!hasDistinctSignals) reasons.push('not_enough_distinct_signals');

  const indexable = reasons.length === 0;
  return { indexable, robots: { index: indexable, follow: true }, reasons };
}

export function buildAreaMetadata(area: Area, summary: string, evaluation: AreaSeoEvaluation): Metadata {
  const title = `Bất động sản ${area.name}`;
  const description = summary.length > 155 ? `${summary.slice(0, 152).trim()}...` : summary;
  const path = `/khu-vuc/${area.slug}`;
  const images = area.image_url ? [{ url: area.image_url, width: 1200, height: 630 }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: evaluation.robots,
    openGraph: {
      type: 'website',
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: 'vi_VN',
      images,
    },
    twitter: { card: 'summary_large_image', title, description, images: area.image_url ? [area.image_url] : undefined },
  };
}

export function buildAreaCollectionJsonLd(area: Area, listings: Pick<Property, 'id' | 'title' | 'slug'>[]): Record<string, unknown> {
  const areaUrl = `${SITE_URL}/khu-vuc/${area.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Bất động sản ${area.name}`,
    url: areaUrl,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: listings.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: p.title,
        url: `${SITE_URL}/bat-dong-san/${(p.slug && p.slug.trim()) || p.id}`,
      })),
    },
  };
}
