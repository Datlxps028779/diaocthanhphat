import type { Metadata } from 'next';
import { CompareClient } from '../_clients/pageClients';

export const metadata: Metadata = {
  title: 'So sánh bất động sản',
  description: 'So sánh nhanh các bất động sản đã chọn: giá, diện tích, giá/m², pháp lý, hướng và tiện ích.',
  alternates: { canonical: '/so-sanh' },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <CompareClient />;
}
