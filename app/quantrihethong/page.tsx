import type { Metadata } from 'next';
import { AdminClient } from '../_clients/AdminClient';

// Trang quản trị → noindex tuyệt đối.
export const metadata: Metadata = {
  title: 'Quản trị hệ thống',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminClient />;
}
