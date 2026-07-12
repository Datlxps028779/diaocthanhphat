import type { Metadata } from 'next';
import { PostListingClient } from '../_clients/pageClients';

export const metadata: Metadata = {
  title: 'Đăng tin bất động sản',
  description: 'Đăng tin mua bán, cho thuê bất động sản miễn phí. Tiếp cận hàng nghìn khách hàng tiềm năng.',
  alternates: { canonical: '/dang-tin' },
};

export default function Page({ searchParams }: { searchParams?: { id?: string } }) {
  return <PostListingClient editId={searchParams?.id} />;
}
