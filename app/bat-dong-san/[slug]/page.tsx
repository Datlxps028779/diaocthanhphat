import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverGetPropertyByIdOrSlug } from '@/lib/supabase-server';
import { buildPropertyMetadata, buildPropertyJsonLd, buildBreadcrumbJsonLd, serializeJsonLd } from '@/lib/seo';
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

  return (
    <>
      {/* JSON-LD SSR — crawler (Google + AI) đọc ngay trong HTML gốc */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />
      <PropertyDetailClient propertyId={slug} initialData={property} />
    </>
  );
}
