import { renderAreaListingPage, areaListingMetadataFactory } from '@/lib/areaListingPage';

export const revalidate = 1800;

export const generateMetadata = areaListingMetadataFactory('cho_thue');

export default async function Page({ params, searchParams }: { params: { areaSlug: string; rest?: string[] }; searchParams?: Record<string, string | string[] | undefined> }) {
  return renderAreaListingPage('cho_thue', params, searchParams);
}
