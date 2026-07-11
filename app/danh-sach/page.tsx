import type { Metadata } from 'next';
import { ListingsClient } from '../_clients/pageClients';
import { serverGetListings } from '@/lib/supabase-server';
import { parseListingParams } from '@/lib/router';

export const metadata: Metadata = {
  title: 'Danh sách bất động sản',
  description: 'Toàn bộ nhà đất, bất động sản mua bán và cho thuê tại Bình Dương và khu vực lân cận.',
  alternates: { canonical: '/danh-sach' },
};
export const revalidate = 1800;

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const props = await serverGetListings();
  return <ListingsClient filters={parseListingParams(searchParams)} initialData={{ data: props, total: props.length }} />;
}
