import type { Metadata } from 'next';
import { ListingsClient } from '../_clients/pageClients';

export const metadata: Metadata = {
  title: 'Cho thuê bất động sản',
  description: 'Danh sách nhà đất, bất động sản cho thuê tại Bình Dương và khu vực lân cận. Giá tốt, pháp lý minh bạch.',
  alternates: { canonical: '/cho-thue' },
};
export const revalidate = 1800;

export default function Page() {
  return <ListingsClient listingType="cho_thue" />;
}
