'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export function DiscoverySectionHeader({
  eyebrow,
  title,
  subtitle,
  href,
  linkLabel = 'Xem tất cả',
  headingId,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  headingId?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-red-600">{eyebrow}</p>}
        <h2 id={headingId} className="text-xl font-black text-gray-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="flex shrink-0 items-center gap-1 text-sm font-bold text-red-700 transition-colors hover:text-red-800">
          {linkLabel}<ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
