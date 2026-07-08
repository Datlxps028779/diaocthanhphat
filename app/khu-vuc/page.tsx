import type { Metadata } from 'next';
import { RegionsClient } from '../_clients/pageClients';

export const metadata: Metadata = {
  title: 'Khu vực bất động sản',
  description: 'Bất động sản theo khu vực tại Bình Dương và các tỉnh lân cận. Thông tin quy hoạch, hạ tầng, giá đất.',
  alternates: { canonical: '/khu-vuc' },
};
export const revalidate = 1800;

export default function Page() {
  return <RegionsClient />;
}
