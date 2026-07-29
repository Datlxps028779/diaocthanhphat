import { renderAreaListingPage, areaListingMetadataFactory } from '@/lib/areaListingPage';

export const revalidate = 1800;

export const generateMetadata = areaListingMetadataFactory('mua_ban');

export default async function Page({ params }: { params: { areaSlug: string; rest?: string[] } }) {
  return renderAreaListingPage('mua_ban', params);
}
