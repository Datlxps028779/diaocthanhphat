import type { Metadata } from 'next';
import { ValuationClient } from '../_clients/pageClients';

export const metadata: Metadata = {
  title: 'Định giá bất động sản',
  description: 'Ước tính nhanh khoảng giá nhà đất, bất động sản tại Bình Dương và khu vực lân cận dựa trên dữ liệu giao dịch tương đương.',
  alternates: { canonical: '/dinh-gia' },
};
export const revalidate = 3600;

export default function Page() {
  return <ValuationClient />;
}
