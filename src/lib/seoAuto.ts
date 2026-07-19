export type AutoSchemaTarget = 'news' | 'property' | 'area' | 'route' | 'home';

export interface AutoSchemaInput {
  title?: string;
  description?: string;
  focus_keywords?: string;
  image_url?: string;
  images?: string[];
  author?: string;
  slug?: string;
  path?: string;
  listing_type?: 'mua_ban' | 'cho_thue';
  price?: string | number;
  price_unit?: string;
  price_per_month?: string | number;
  city?: string;
  district?: string;
  area_sqm?: string | number;
  bedrooms?: string | number;
  bathrooms?: string | number;
  address?: string;
  latitude?: string | number;
  longitude?: string | number;
  site_name?: string;
  route_type?: 'WebPage' | 'CollectionPage' | 'AboutPage' | 'WebSite' | 'FAQPage';
}

function compact(value?: string) {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

function firstKeyword(value?: string) {
  return compact(value)
    .split(',')
    .map(part => part.trim())
    .find(Boolean) ?? '';
}

function pathLabel(path?: string) {
  return (path ?? '')
    .replace(/^\//, '')
    .replace(/[-_/]+/g, ' ')
    .trim();
}

function routeTypeFromPath(path?: string): AutoSchemaInput['route_type'] {
  const normalized = (path ?? '').split('?')[0].replace(/\/$/, '') || '/';
  if (normalized === '/' || normalized === '/ve-chung-toi') return 'WebPage';
  if (['/tin-tuc', '/danh-sach', '/mua-ban', '/cho-thue', '/khu-vuc'].includes(normalized)) return 'CollectionPage';
  return 'WebPage';
}

function deriveName(input: AutoSchemaInput, fallbackPath?: string) {
  return compact(input.title)
    || firstKeyword(input.focus_keywords)
    || pathLabel(input.path || fallbackPath)
    || compact(input.site_name)
    || 'Trang';
}

function resolvePath(input: AutoSchemaInput, fallbackPath?: string) {
  return input.path || fallbackPath || '/';
}

export function buildAutoSchema(
  target: AutoSchemaTarget,
  input: AutoSchemaInput,
  options?: { basePath?: string; routeType?: AutoSchemaInput['route_type'] },
): Record<string, unknown> {
  const path = resolvePath(input, options?.basePath);
  const name = deriveName(input, path);
  const description = compact(input.description) || name;
  const routeType = options?.routeType || input.route_type || routeTypeFromPath(path);
  const image = input.image_url || input.images?.[0] || undefined;

  switch (target) {
    case 'news':
      return {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: name,
        description,
        image,
        author: { '@type': 'Organization', name: compact(input.author) || compact(input.site_name) || 'BĐS Bình Dương' },
        mainEntityOfPage: path,
        url: path,
      };
    case 'property': {
      const price = input.listing_type === 'cho_thue'
        ? (input.price_per_month ? `${input.price_per_month} VND` : '')
        : (input.price ? `${input.price} ${input.price_unit ?? 'tỷ'}` : '');
      const schema: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'RealEstateListing',
        name,
        description,
        url: path,
      };
      if (price) {
        schema.offers = {
          '@type': 'Offer',
          price,
          priceCurrency: 'VND',
        };
      }
      if (image) schema.image = image;
      if (input.area_sqm) {
        schema.floorSize = { '@type': 'QuantitativeValue', value: input.area_sqm, unitCode: 'MTK' };
      }
      if (input.bedrooms) schema.numberOfRooms = input.bedrooms;
      if (input.bathrooms) schema.amenityFeature = [{ '@type': 'LocationFeatureSpecification', name: `Phòng tắm: ${input.bathrooms}` }];
      if (input.address || input.city || input.district) {
        schema.address = {
          '@type': 'PostalAddress',
          streetAddress: input.address || '',
          addressLocality: input.district || '',
          addressRegion: input.city || '',
          addressCountry: 'VN',
        };
      }
      if (input.latitude && input.longitude) {
        schema.geo = {
          '@type': 'GeoCoordinates',
          latitude: input.latitude,
          longitude: input.longitude,
        };
      }
      return schema;
    }
    case 'area':
      return {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name,
        description,
        mainEntityOfPage: path,
        url: path,
      };
    case 'home':
      return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name,
        description,
        url: path,
      };
    case 'route':
    default:
      return {
        '@context': 'https://schema.org',
        '@type': routeType,
        name,
        description,
        url: path,
        ...(routeType === 'CollectionPage' ? { mainEntityOfPage: path } : {}),
      };
  }
}

export function schemaToJson(schema: Record<string, unknown>): string {
  return JSON.stringify(schema, null, 2);
}
