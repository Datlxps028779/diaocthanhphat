import type { Metadata } from 'next';
import { AccountClient } from '../_clients/pageClients';

// Trang riêng tư → noindex.
export const metadata: Metadata = {
  title: 'Tài khoản',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AccountClient />;
}
