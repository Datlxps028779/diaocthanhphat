import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminClient } from '../../_clients/AdminClient';
import { getPrivateAccess } from '@/lib/server/privateAccess';

// Trang quản trị → noindex tuyệt đối.
export const metadata: Metadata = {
  title: 'Quản trị hệ thống',
  robots: { index: false, follow: false, nocache: true },
};

// Optional catch-all: /quantrihethong và /quantrihethong/{tab} cùng vào đây.
// seg[0] là id tab (news, properties, seo-geo...) → initialTab để mở đúng mục.
export default async function Page({ params }: { params: { seg?: string[] } }) {
  const access = await getPrivateAccess();
  if (!access.ownerMfa) notFound();
  return <AdminClient initialTab={params.seg?.[0]} forceOwner />;
}
