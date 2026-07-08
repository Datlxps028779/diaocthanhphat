import type { Metadata } from 'next';
import { NewsListClient } from '../_clients/pageClients';

export const metadata: Metadata = {
  title: 'Tin tức thị trường bất động sản',
  description: 'Tin tức, phân tích thị trường bất động sản, quy hoạch, hạ tầng tại Bình Dương và khu vực lân cận.',
  alternates: { canonical: '/tin-tuc' },
};
export const revalidate = 1800;

export default function Page() {
  return <NewsListClient />;
}
