import type { Metadata } from 'next';
import { ListingsClient } from '../_clients/pageClients';

export const metadata: Metadata = {
  title: 'Mua bán bất động sản',
  description: 'Danh sách nhà đất, bất động sản mua bán tại Bình Dương và khu vực lân cận. Giá tốt, pháp lý minh bạch.',
  alternates: { canonical: '/mua-ban' },
};
export const revalidate = 1800;

export default function Page() {
  return <ListingsClient listingType="mua_ban" />;
}
