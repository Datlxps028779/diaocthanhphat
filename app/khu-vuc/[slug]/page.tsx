import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildLocalityMetadata } from '@/lib/localityPageData';
import { loadLocalityPage, renderLocalityOverview } from '@/lib/server/localityPage';

export const revalidate = 60;

type Props = { params: { slug: string }; searchParams?: Record<string, string | string[] | undefined> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const data = await loadLocalityPage(`/khu-vuc/${params.slug}`);
  if (!data) notFound();
  return buildLocalityMetadata(data, Object.keys(searchParams ?? {}).length > 0);
}

export default function AreaPage({ params, searchParams }: Props) {
  return renderLocalityOverview(`/khu-vuc/${params.slug}`, Object.keys(searchParams ?? {}).length > 0, searchParams);
}
