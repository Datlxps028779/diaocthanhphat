import type { Metadata } from 'next';
import { ListingsClient } from '../_clients/pageClients';
import { serverGetListings } from '@/lib/supabase-server';
import { parseListingParams } from '@/lib/router';

export const metadata: Metadata = {
  title: 'Mua bán bất động sản',
  description: 'Danh sách nhà đất, bất động sản mua bán tại Bình Dương và khu vực lân cận. Giá tốt, pháp lý minh bạch.',
  alternates: { canonical: '/mua-ban' },
};
export const revalidate = 1800;

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  // SSR: crawler + AI đọc được danh sách ngay trong HTML gốc (không chờ JS).
  const props = await serverGetListings('mua_ban');
  return <ListingsClient listingType="mua_ban" filters={parseListingParams(searchParams)} initialData={{ data: props, total: props.length }} />;
}
