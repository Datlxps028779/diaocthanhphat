import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverGetPropertyByIdOrSlug } from '@/lib/supabase-server';
import { buildPropertyMetadata, buildPropertyJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';
import { buildPropertyFaq, buildFaqJsonLd } from '@/lib/propertyFaq';
import { JsonLdScripts } from '@/components/JsonLdScripts';
import { PropertyDetailClient } from './PropertyDetailClient';

// ISR: render lại tối đa mỗi giờ (cân tốc độ vs độ tươi). Tin sửa xong crawler thấy
// chậm nhất sau 1h; có thể hạ xuống hoặc dùng on-demand revalidate sau.
export const revalidate = 3600;

type Params = { params: { slug: string } };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const property = await serverGetPropertyByIdOrSlug(decodeURIComponent(params.slug));
  if (!property) return { title: 'Không tìm thấy bất động sản' };
  return buildPropertyMetadata(property);
}

export default async function PropertyPage({ params }: Params) {
  const slug = decodeURIComponent(params.slug);
  const property = await serverGetPropertyByIdOrSlug(slug);
  if (!property) notFound();

  const jsonLd = buildPropertyJsonLd(property);
  const listingHref = property.listing_type === 'cho_thue' ? '/cho-thue' : '/mua-ban';
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Trang chủ', path: '/' },
    { name: property.listing_type === 'cho_thue' ? 'Cho thuê' : 'Mua bán', path: listingHref },
    { name: property.title, path: `/bat-dong-san/${(property.slug && property.slug.trim()) || property.id}` },
  ]);
  // FAQPage chỉ emit khi có FAQ thật (khớp khối FAQ visible trong PropertyDetailPage).
  const faqJsonLd = buildFaqJsonLd(buildPropertyFaq(property));
  const schemas = [jsonLd, breadcrumbJsonLd, ...(faqJsonLd ? [faqJsonLd] : [])];

  return (
    <>
      <JsonLdScripts schemas={schemas} />
      <PropertyDetailClient propertyId={slug} initialData={property} />
    </>
  );
}
