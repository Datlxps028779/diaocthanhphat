import type { Metadata } from 'next';
import { MyListingsClient } from '../_clients/pageClients';

// Trang riêng tư → noindex (không cho crawler index).
export const metadata: Metadata = {
  title: 'Tin đăng của tôi',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <MyListingsClient />;
}
