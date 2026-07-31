import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPrivateAccess } from '@/lib/server/privateAccess';
import { OwnerMfaClient } from '../_clients/OwnerMfaClient';

export const metadata: Metadata = {
  title: 'Xác thực đa yếu tố',
  robots: { index: false, follow: false, nocache: true },
};

export default async function OwnerMfaPage() {
  const access = await getPrivateAccess();
  if (!access.owner) notFound();
  return <OwnerMfaClient />;
}
