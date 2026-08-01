import Link from 'next/link';
import { ArrowRight, Inbox } from 'lucide-react';
import { SkeletonCard } from './ui/Skeleton';

export type HomeSectionSourceMode = 'auto' | 'manual' | 'mixed';
export type HomeSectionEmptyBehavior = 'hide' | 'empty_state';

export type HomeSectionDisplayConfig = {
  sourceMode: HomeSectionSourceMode;
  emptyBehavior: HomeSectionEmptyBehavior;
  emptyTitle: string;
  emptyDescription: string;
  emptyCtaLabel: string;
  emptyCtaHref: string;
};

export function getHomeSectionDisplayConfig(settings: Record<string, unknown>): HomeSectionDisplayConfig {
  const sourceMode = settings.source_mode;
  const emptyBehavior = settings.empty_behavior;

  return {
    sourceMode: sourceMode === 'manual' || sourceMode === 'mixed' ? sourceMode : 'auto',
    emptyBehavior: emptyBehavior === 'empty_state' ? 'empty_state' : 'hide',
    emptyTitle: typeof settings.empty_title === 'string' ? settings.empty_title.trim() : '',
    emptyDescription: typeof settings.empty_description === 'string' ? settings.empty_description.trim() : '',
    emptyCtaLabel: typeof settings.empty_cta_label === 'string' ? settings.empty_cta_label.trim() : '',
    emptyCtaHref: typeof settings.empty_cta_href === 'string' ? settings.empty_cta_href.trim() : '',
  };
}

export function HomeSectionLoading({ cards = 3 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Đang tải nội dung">
      {Array.from({ length: cards }).map((_, index) => <SkeletonCard key={index} />)}
    </div>
  );
}

export function HomeSectionEmpty({ config }: { config: HomeSectionDisplayConfig }) {
  if (config.emptyBehavior !== 'empty_state') return null;

  const title = config.emptyTitle || 'Chưa có nội dung phù hợp';
  const description = config.emptyDescription || 'Nội dung sẽ xuất hiện khi có dữ liệu đã được xác thực.';

  return (
    <div className="flex min-h-44 flex-col items-center justify-center border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-red-600 shadow-sm">
        <Inbox className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {config.emptyCtaLabel && config.emptyCtaHref && (
        <Link href={config.emptyCtaHref} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-red-700 hover:text-red-800">
          {config.emptyCtaLabel}<ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
