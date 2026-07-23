import type { Metadata } from 'next';
import { AdminClient } from '../../_clients/AdminClient';

// Trang quản trị → noindex tuyệt đối.
export const metadata: Metadata = {
  title: 'Quản trị hệ thống',
  robots: { index: false, follow: false },
};

// Optional catch-all: /quantrihethong và /quantrihethong/{tab} cùng vào đây.
// seg[0] là id tab (news, properties, seo-geo...) → initialTab để mở đúng mục.
export default function Page({ params }: { params: { seg?: string[] } }) {
  return <AdminClient initialTab={params.seg?.[0]} />;
}
