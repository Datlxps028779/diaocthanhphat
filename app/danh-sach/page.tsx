import type { Metadata } from 'next';
import { ListingsClient } from '../_clients/pageClients';
import { serverGetListings } from '@/lib/supabase-server';

export const metadata: Metadata = {
  title: 'Danh sách bất động sản',
  description: 'Toàn bộ nhà đất, bất động sản mua bán và cho thuê tại Bình Dương và khu vực lân cận.',
  alternates: { canonical: '/danh-sach' },
};
export const revalidate = 1800;

export default async function Page() {
  const props = await serverGetListings();
  return <ListingsClient initialData={{ data: props, total: props.length }} />;
}
