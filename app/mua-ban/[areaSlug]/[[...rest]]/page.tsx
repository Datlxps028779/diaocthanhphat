import { renderAreaListingPage, areaListingMetadataFactory } from '@/lib/areaListingPage';

export const revalidate = 1800;

export const generateMetadata = areaListingMetadataFactory('mua_ban');

export default async function Page({ params, searchParams }: { params: { areaSlug: string; rest?: string[] }; searchParams?: Record<string, string | string[] | undefined> }) {
  return renderAreaListingPage('mua_ban', params, searchParams);
}
