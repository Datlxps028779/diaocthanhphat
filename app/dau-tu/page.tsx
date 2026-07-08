import type { Metadata } from 'next';
import { InvestClient } from '../_clients/pageClients';

export const metadata: Metadata = {
  title: 'Đầu tư bất động sản',
  description: 'Cơ hội đầu tư bất động sản sinh lời tại Bình Dương và khu vực lân cận. Công cụ tính ROI, tư vấn đầu tư.',
  alternates: { canonical: '/dau-tu' },
};
export const revalidate = 1800;

export default function Page() {
  return <InvestClient />;
}
