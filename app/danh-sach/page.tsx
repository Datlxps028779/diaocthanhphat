import type { Metadata } from 'next';
import { ListingsClient } from '../_clients/pageClients';

export const metadata: Metadata = {
  title: 'Danh sách bất động sản',
  description: 'Toàn bộ nhà đất, bất động sản mua bán và cho thuê tại Bình Dương và khu vực lân cận.',
  alternates: { canonical: '/danh-sach' },
};
export const revalidate = 1800;

export default function Page() {
  return <ListingsClient />;
}
