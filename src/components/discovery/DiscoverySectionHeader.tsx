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
        {eyebrow && <p className="cnv-eyebrow mb-1 text-red-600">{eyebrow}</p>}
        <h2 id={headingId} className="cnv-section-title text-gray-900">{title}</h2>
        {subtitle && <p className="cnv-body-copy mt-1 text-gray-500">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="cnv-control-type flex shrink-0 items-center gap-1 text-red-700 transition-colors hover:text-red-800">
          {linkLabel}<ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
