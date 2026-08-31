import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverGetPropertyByPublicCode } from '@/lib/supabase-server';
import { buildPropertyMetadata, buildPropertyJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';
import { buildPropertyFaq, buildFaqJsonLd } from '@/lib/propertyFaq';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { PropertyDetailClient } from '../../app/bat-dong-san/[slug]/PropertyDetailClient';
import { buildProductPath, parseProductCode } from '@/lib/productPath';
import type { ListingType } from '@/lib/areaPath';
import type { Property } from '@/lib/supabase';
import { normalizeListingTitle } from '@/lib/listingTitle';

// Nhánh chi tiết sản phẩm trong cây route khu vực: /{lt}/{areaSlug}/{districtSlug?}/
// {slug}-pr{code}. Segment không có -pr{số} tiếp tục nhánh listing khu vực.

// Bóc public_code từ rest catch-all. Trả null nếu segment cuối không phải đuôi -pr{số}.
export function detectProductCode(rest: string[] | undefined): number | null {
  const segs = rest ?? [];
  if (segs.length === 0) return null;
  const parsed = parseProductCode(segs[segs.length - 1]);
  return parsed ? parsed.code : null;
}

// Resolve property theo code. Null → caller gọi notFound(). listingType từ folder route
// dùng để chống lẫn /mua-ban với /cho-thue (tin cho thuê không mở dưới /mua-ban).
async function loadProduct(listingType: ListingType, code: number): Promise<Property | null> {
  const property = await serverGetPropertyByPublicCode(code);
  if (!property) return null;
  if (property.listing_type !== listingType) return null;
  return property;
}

export async function productMetadataFromRest(listingType: ListingType, rest: string[] | undefined): Promise<Metadata | null> {
  const code = detectProductCode(rest);
  if (code == null) return null;
  const property = await loadProduct(listingType, code);
  if (!property) notFound();
  return buildPropertyMetadata(property);
}

// Render chi tiết sản phẩm, tái dùng builders + client của route /bat-dong-san cũ để
// nội dung/JSON-LD nhất quán. Middleware lo hard 308/404 trước khi root loading stream.
export async function renderProductDetail(
  listingType: ListingType,
  rest: string[] | undefined,
) {
  const code = detectProductCode(rest)!;
  const property = await loadProduct(listingType, code);
  if (!property) notFound();
  const canonical = buildProductPath(property);

  const jsonLd = buildPropertyJsonLd(property);
  const listingHref = property.listing_type === 'cho_thue' ? '/cho-thue' : '/mua-ban';
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Trang chủ', path: '/' },
    { name: property.listing_type === 'cho_thue' ? 'Cho thuê' : 'Mua bán', path: listingHref },
    { name: normalizeListingTitle(property.title).value, path: canonical },
  ]);
  const faqItems = property.faq && property.faq.length > 0 ? property.faq : buildPropertyFaq(property);
  const faqJsonLd = buildFaqJsonLd(faqItems);
  const schemas = [jsonLd, breadcrumbJsonLd, ...(faqJsonLd ? [faqJsonLd] : [])];

  return (
    <>
      <JsonLdScripts schemas={schemas} />
      <PropertyDetailClient propertyId={(property.slug && property.slug.trim()) || property.id} initialData={property} />
    </>
  );
}
