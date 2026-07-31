import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminClient } from '../../_clients/AdminClient';
import { getPrivateAccess } from '@/lib/server/privateAccess';

export const metadata: Metadata = {
  title: 'Nội bộ',
  robots: { index: false, follow: false, nocache: true },
};

export default async function StaffWorkspacePage({ params }: { params: { seg?: string[] } }) {
  const access = await getPrivateAccess();
  if (!access.ownerMfa && !access.staff) notFound();
  return <AdminClient initialTab={params.seg?.[0]} forceStaff />;
}
