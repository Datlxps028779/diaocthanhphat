import type { Metadata } from 'next';
import { ResetPasswordClient } from './ResetPasswordClient';

export const metadata: Metadata = {
  title: 'Đặt lại mật khẩu',
  robots: { index: false, follow: false },
};

export default function DatLaiMatKhauPage() {
  return <ResetPasswordClient />;
}
