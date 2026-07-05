import { useState, useEffect, useCallback, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SEOFields {
  meta_title: string;
  meta_description: string;
  focus_keywords: string;
  schema_markup: string; // JSON-LD string
}

export interface SEOInput {
  title: string;
  description: string;
  price?: string | number;
  price_unit?: string;
  price_per_month?: string | number;
  listing_type?: 'mua_ban' | 'cho_thue';
  city?: string;
  district?: string;
  area_sqm?: string | number;
  bedrooms?: string | number;
  bathrooms?: string | number;
  image_url?: string;
  images?: string[];
  address?: string;
  latitude?: string | number;
  longitude?: string | number;
  contact_name?: string;
  contact_phone?: string;
  property_type_name?: string;
}

// ─── Slug generator (frontend mirror of DB generate_slug) ─────────────────────
export function generateSlug(title: string): string {
  if (!title) return '';
  let str = title.toLowerCase();
  // Bỏ dấu tiếng Việt
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Thay ký tự đặc biệt
  str = str.replace(/đ/g, 'd');
  // Chỉ giữ a-z, 0-9, space, dash
  str = str.replace(/[^a-z0-9\s-]/g, '');
  // Space → dash
  str = str.replace(/\s+/g, '-');
  // Gộp dash liên tiếp
  str = str.replace(/-+/g, '-');
  // Trim dash
  str = str.replace(/^-+|-+$/g, '');
  // Giới hạn 100 ký tự
  return str.substring(0, 100);
}

// ─── JSON-LD RealEstateListing generator ──────────────────────────────────────
export function generateRealEstateSchema(input: SEOInput): Record<string, unknown> {
  const price = input.listing_type === 'cho_thue'
    ? (input.price_per_month ? `${input.price_per_month} VND` : '')
    : (input.price ? `${input.price} ${input.price_unit ?? 'tỷ'}` : '');

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    'name': input.title,
    'description': input.description || input.title,
    'url': typeof window !== 'undefined' ? window.location.href : '',
  };

  if (price) {
    schema['offers'] = {
      '@type': 'Offer',
      'price': price,
      'priceCurrency': 'VND',
    };
  }

  if (input.image_url || (input.images && input.images.length > 0)) {
    schema['image'] = input.image_url ?? input.images![0];
  }

  if (input.area_sqm) {
    schema['floorSize'] = {
      '@type': 'QuantitativeValue',
      'value': input.area_sqm,
      'unitCode': 'MTK',
    };
  }

  if (input.bedrooms) schema['numberOfRooms'] = input.bedrooms;
  if (input.bathrooms) schema['amenityFeature'] = [{ '@type': 'LocationFeatureSpecification', 'name': `Phòng tắm: ${input.bathrooms}` }];

  if (input.address || input.city || input.district) {
    schema['address'] = {
      '@type': 'PostalAddress',
      'streetAddress': input.address || '',
      'addressLocality': input.district || '',
      'addressRegion': input.city || '',
      'addressCountry': 'VN',
    };
  }

  if (input.latitude && input.longitude) {
    schema['geo'] = {
      '@type': 'GeoCoordinates',
      'latitude': input.latitude,
      'longitude': input.longitude,
    };
  }

  if (input.contact_name || input.contact_phone) {
    schema['seller'] = {
      '@type': 'RealEstateAgent',
      'name': input.contact_name || '',
      'telephone': input.contact_phone || '',
    };
  }

  return schema;
}

// ─── Hook: useSEOAutofill ─────────────────────────────────────────────────────
// Tự động fill meta_title, meta_description, focus_keywords, schema_markup
// dựa trên các trường đầu vào. Cho phép user override.
export function useSEOAutofill(input: SEOInput) {
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [focusKeywords, setFocusKeywords] = useState('');
  const [schemaMarkup, setSchemaMarkup] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Auto-fill khi input thay đổi và field chưa bị user touch
  useEffect(() => {
    if (!touched.meta_title) {
      const auto = input.title ? input.title.substring(0, 60) : '';
      setMetaTitle(auto);
    }
  }, [input.title, touched.meta_title]);

  useEffect(() => {
    if (!touched.meta_description) {
      const auto = input.description ? input.description.substring(0, 155) : '';
      setMetaDescription(auto);
    }
  }, [input.description, touched.meta_description]);

  useEffect(() => {
    if (!touched.focus_keywords) {
      // Tự động tạo focus keywords từ title + city + district
      const parts = [input.title, input.city, input.district, input.property_type_name]
        .filter(Boolean)
        .join(', ');
      setFocusKeywords(parts);
    }
  }, [input.title, input.city, input.district, input.property_type_name, touched.focus_keywords]);

  // Auto-generate schema markup
  const autoSchema = useMemo(() => generateRealEstateSchema(input), [input]);
  useEffect(() => {
    if (!touched.schema_markup) {
      setSchemaMarkup(JSON.stringify(autoSchema, null, 2));
    }
  }, [autoSchema, touched.schema_markup]);

  // Mark field as touched khi user chỉnh
  const handleMetaTitleChange = useCallback((v: string) => {
    setMetaTitle(v);
    setTouched(t => ({ ...t, meta_title: true }));
  }, []);
  const handleMetaDescriptionChange = useCallback((v: string) => {
    setMetaDescription(v);
    setTouched(t => ({ ...t, meta_description: true }));
  }, []);
  const handleFocusKeywordsChange = useCallback((v: string) => {
    setFocusKeywords(v);
    setTouched(t => ({ ...t, focus_keywords: true }));
  }, []);
  const handleSchemaMarkupChange = useCallback((v: string) => {
    setSchemaMarkup(v);
    setTouched(t => ({ ...t, schema_markup: true }));
  }, []);

  // Reset touched + re-auto-fill
  const resetAuto = useCallback(() => {
    setTouched({});
  }, []);

  // Validation: độ dài title (60) và description (155)
  const titleValid = metaTitle.length > 0 && metaTitle.length <= 60;
  const descValid = metaDescription.length > 0 && metaDescription.length <= 155;

  return {
    metaTitle, setMetaTitle: handleMetaTitleChange,
    metaDescription, setMetaDescription: handleMetaDescriptionChange,
    focusKeywords, setFocusKeywords: handleFocusKeywordsChange,
    schemaMarkup, setSchemaMarkup: handleSchemaMarkupChange,
    resetAuto,
    titleValid, descValid,
    titleLength: metaTitle.length,
    descLength: metaDescription.length,
  };
}

// ─── Component: SEO Live Preview ──────────────────────────────────────────────
// Hiển thị preview Google SERP + thanh đo độ dài
export function SEOPreview({ metaTitle, metaDescription, focusKeywords }: {
  metaTitle: string;
  metaDescription: string;
  focusKeywords: string;
}) {
  const titleLen = metaTitle.length;
  const descLen = metaDescription.length;
  const titleColor = titleLen === 0 ? 'text-red-500' : titleLen <= 60 ? 'text-emerald-500' : 'text-amber-500';
  const descColor = descLen === 0 ? 'text-red-500' : descLen <= 155 ? 'text-emerald-500' : 'text-amber-500';

  return (
    <div className="space-y-3">
      {/* Google SERP Preview */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-700 mb-2">Preview Google Search</p>
        <div className="text-xs text-emerald-700 truncate">{typeof window !== 'undefined' ? window.location.origin : 'https://bdsbinhduong.vn'}/bat-dong-san/...</div>
        <div className="text-base text-blue-700 font-medium leading-snug line-clamp-2 mt-0.5">{metaTitle || 'Tiêu đề SEO sẽ hiển thị ở đây'}</div>
        <div className="text-sm text-gray-600 line-clamp-2 mt-0.5">{metaDescription || 'Meta description sẽ hiển thị ở đây...'}</div>
      </div>

      {/* Độ dài indicators */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600 font-medium">Tiêu đề SEO</span>
            <span className={titleColor}>{titleLen}/60</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${titleLen === 0 ? 'bg-red-500' : titleLen <= 60 ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${Math.min((titleLen / 60) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600 font-medium">Meta Description</span>
            <span className={descColor}>{descLen}/155</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${descLen === 0 ? 'bg-red-500' : descLen <= 155 ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${Math.min((descLen / 155) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {focusKeywords && (
        <div className="text-xs text-gray-500">
          <span className="font-medium">Từ khóa chính: </span>
          <span className="text-gray-700">{focusKeywords}</span>
        </div>
      )}
    </div>
  );
}