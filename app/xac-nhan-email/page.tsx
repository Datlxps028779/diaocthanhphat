import type { Metadata } from 'next';
import { ConfirmEmailClient } from './ConfirmEmailClient';

export const metadata: Metadata = {
  title: 'Xác nhận email',
  robots: { index: false, follow: false },
};

export default function XacNhanEmailPage() {
  return <ConfirmEmailClient />;
}
