import type { Metadata } from 'next';
import { OwnerLoginClient } from '../_clients/OwnerLoginClient';

export const metadata: Metadata = {
  title: 'Xác thực',
  robots: { index: false, follow: false, nocache: true },
};

export default function OwnerLoginPage() {
  return <OwnerLoginClient />;
}
