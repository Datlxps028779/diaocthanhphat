import type { Metadata } from 'next';
import { NewsListClient } from '../_clients/pageClients';
import { serverGetNews } from '@/lib/supabase-server';

export const metadata: Metadata = {
  title: 'Tin tức thị trường bất động sản',
  description: 'Tin tức, phân tích thị trường bất động sản, quy hoạch, hạ tầng tại Bình Dương và khu vực lân cận.',
  alternates: { canonical: '/tin-tuc' },
};
export const revalidate = 1800;

export default async function Page() {
  const articles = await serverGetNews();
  return <NewsListClient initialArticles={articles} />;
}
